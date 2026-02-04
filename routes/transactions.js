const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth, admin } = require('../middleware/authMiddleware');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const { recomputeAccountBalance, recomputePartnerBalances } = require('../services/accountingService');

// @route   POST api/transactions
// @desc    Create a transaction (Manual) -> Update Accounts & Partner Balances
// @access  Private
router.post('/', auth, async (req, res) => {
    const { type, amount, description, date, customer, supplier, account } = req.body;

    // Validate ObjectId fields
    if (customer && !mongoose.Types.ObjectId.isValid(customer)) return res.status(400).json({ msg: 'Invalid customer ID' });
    if (supplier && !mongoose.Types.ObjectId.isValid(supplier)) return res.status(400).json({ msg: 'Invalid supplier ID' });
    if (account && !mongoose.Types.ObjectId.isValid(account)) return res.status(400).json({ msg: 'Invalid account ID' });

    try {
        const newTransaction = new Transaction({
            type,
            amount,
            description,
            date,
            customer,
            supplier,
            // Map account to source/target based on type
            sourceAccount: type === 'expense' ? account : undefined,
            targetAccount: type === 'income' ? account : undefined,
            company: req.user.company,
            createdBy: req.user.id
        });
        const transaction = await newTransaction.save();

        // Recompute Balances
        if (account) {
            const acc = await Account.findById(account);
            if (acc) await recomputeAccountBalance(acc);
        }
        
        // Recompute Partner Balances (Customer/Supplier)
        // We recompute all for the company to be safe, or just the specific one.
        // The service recomputes ALL partners. That might be slow if there are many.
        // Let's optimize the service later if needed, but for now, let's just update the specific partner if possible.
        // Actually, the service has `recomputePartnerBalances` which loops all. 
        // Let's stick to the manual update for now OR improve the service to take a partnerId.
        // For robustness, I'll use the service but maybe I should make a specific function for one partner.
        // For now, let's just call the bulk one, it's safer.
        await recomputePartnerBalances(req.user.company);

        res.json(transaction);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/transactions/:id
// @desc    Update a transaction
// @access  Private
router.put('/:id', auth, async (req, res) => {
    const { type, amount, description, date, customer, supplier, account } = req.body;
    try {
        let transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ msg: 'Transaction not found' });
        if (transaction.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        // Update fields
        transaction.type = type || transaction.type;
        transaction.amount = amount || transaction.amount;
        transaction.description = description || transaction.description;
        transaction.date = date || transaction.date;
        transaction.customer = customer || transaction.customer;
        transaction.supplier = supplier || transaction.supplier;
        
        if (account) {
             transaction.sourceAccount = (transaction.type === 'expense') ? account : undefined;
             transaction.targetAccount = (transaction.type === 'income') ? account : undefined;
        }

        await transaction.save();

        // Recompute related account
        if (transaction.sourceAccount) {
            const acc = await Account.findById(transaction.sourceAccount);
            if (acc) await recomputeAccountBalance(acc);
        }
        if (transaction.targetAccount) {
            const acc = await Account.findById(transaction.targetAccount);
            if (acc) await recomputeAccountBalance(acc);
        }
        
        // Recompute partners
        await recomputePartnerBalances(req.user.company);

        res.json(transaction);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/transactions/:id
// @desc    Delete a transaction
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ msg: 'Transaction not found' });
        if (transaction.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        const { sourceAccount, targetAccount } = transaction;

        await Transaction.findByIdAndDelete(req.params.id);

        // Recompute related accounts
        if (sourceAccount) {
            const acc = await Account.findById(sourceAccount);
            if (acc) await recomputeAccountBalance(acc);
        }
        if (targetAccount) {
            const acc = await Account.findById(targetAccount);
            if (acc) await recomputeAccountBalance(acc);
        }

        // Recompute partners
        await recomputePartnerBalances(req.user.company);

        res.json({ msg: 'Transaction removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/transactions
// @desc    Get all transactions
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const { account, type, startDate, endDate, search } = req.query;
        const query = { company: req.user.company };
        if (account) {
            query.$or = [
                { sourceAccount: account },
                { targetAccount: account }
            ];
        }
        if (type) query.type = type;
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        if (search) {
            const regex = new RegExp(search, 'i');
            query.$or = query.$or || [];
            query.$or.push({ description: regex });
        }
        const transactions = await Transaction.find(query)
            .populate('customer', 'name')
            .populate('supplier', 'name')
            .populate('sourceAccount', 'name')
            .populate('targetAccount', 'name')
            .sort({ date: -1 });

        res.json(transactions);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/transactions/transfer
// @desc    Create a transfer transaction between accounts
// @access  Private
router.post('/transfer', auth, async (req, res) => {
    try {
        const { sourceAccount, targetAccount, amount, description, date, currency } = req.body;
        if (!sourceAccount || !targetAccount || !amount) throw new Error('Zorunlu alanlar eksik.');
        if (sourceAccount === targetAccount) throw new Error('Kaynak ve hedef hesap aynı olamaz.');

        const tx = new Transaction({
            type: 'transfer',
            sourceAccount,
            targetAccount,
            amount,
            description,
            date: date || new Date(),
            currency,
            company: req.user.company,
            createdBy: req.user.id
        });
        await tx.save();

        // Recompute both accounts
        const src = await Account.findById(sourceAccount);
        const tgt = await Account.findById(targetAccount);
        if (src) await recomputeAccountBalance(src);
        if (tgt) await recomputeAccountBalance(tgt);

        res.status(201).json(tx);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: err.message || 'Transfer işlemi başarısız.' });
    }
});

// @route   GET api/transactions/flow
// @desc    Get cash flow grouped by day/week/month
// @access  Private
router.get('/flow', auth, async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'day', account } = req.query;
        const match = { company: req.user.company };
        if (startDate || endDate) {
            match.date = {};
            if (startDate) match.date.$gte = new Date(startDate);
            if (endDate) match.date.$lte = new Date(endDate);
        }
        if (account) {
            match.$or = [
                { sourceAccount: new mongoose.Types.ObjectId(account) },
                { targetAccount: new mongoose.Types.ObjectId(account) }
            ];
        }

        let dateFormat = '%Y-%m-%d';
        if (groupBy === 'month') dateFormat = '%Y-%m';
        if (groupBy === 'week') dateFormat = '%Y-%U';

        const flow = await Transaction.aggregate([
            { $match: match },
            { $addFields: { dateStr: { $dateToString: { format: dateFormat, date: '$date' } } } },
            {
                $group: {
                    _id: { date: '$dateStr', type: '$type' },
                    total: { $sum: '$amount' }
                }
            },
            {
                $group: {
                    _id: '$_id.date',
                    data: { $push: { type: '$_id.type', total: '$total' } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const result = flow.map(f => {
            const income = f.data.find(d => d.type === 'income')?.total || 0;
            const expense = f.data.find(d => d.type === 'expense')?.total || 0;
            const transferIn = f.data.find(d => d.type === 'transfer')?.total || 0; // Logic for transfer might need adjustment based on account perspective
            return { date: f._id, income, expense, transferIn };
        });
        res.json(result);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Nakit akışı raporu alınamadı.' });
    }
});

// @route   DELETE api/transactions/:id
// @desc    Delete a transaction and recompute balances
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ 
            _id: req.params.id, 
            company: req.user.company 
        });

        if (!transaction) {
            return res.status(404).json({ error: 'İşlem bulunamadı.' });
        }

        // Store related accounts/partners before deletion
        const sourceAccount = transaction.sourceAccount;
        const targetAccount = transaction.targetAccount;
        const customer = transaction.customer;
        const supplier = transaction.supplier;

        // Delete the transaction
        await Transaction.findByIdAndDelete(req.params.id);

        // Recompute balances
        if (sourceAccount) {
            const acc = await Account.findById(sourceAccount);
            if (acc) await recomputeAccountBalance(acc);
        }
        if (targetAccount) {
            const acc = await Account.findById(targetAccount);
            if (acc) await recomputeAccountBalance(acc);
        }
        if (customer) {
            await recomputePartnerBalances(req.user.company);
        }
        if (supplier) {
            await recomputePartnerBalances(req.user.company);
        }

        res.json({ success: true, message: 'İşlem başarıyla silindi.' });
    } catch (err) {
        console.error('Delete transaction error:', err);
        res.status(500).json({ error: 'İşlem silinirken hata oluştu.', details: err.message });
    }
});

module.exports = router;
