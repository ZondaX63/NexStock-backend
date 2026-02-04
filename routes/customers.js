const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/authMiddleware');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const Invoice = require('../models/Invoice');
const Transaction = require('../models/Transaction');

// @route   POST api/customers
// @desc    Create a customer or supplier
// @access  Private
router.post('/', auth, async (req, res) => {
    const { name, email, phone, address, type, taxNumber, taxOffice } = req.body;
    try {
        const Model = type === 'supplier' ? require('../models/Supplier') : Customer;
        const newEntity = new Model({
            name,
            email,
            phone,
            address,
            taxNumber,
            taxOffice,
            company: req.user.company
        });
        const entity = await newEntity.save();
        res.json(entity);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/customers
// @desc    Get all customers with pagination
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, sort = 'name', order = 'asc', search = '' } = req.query;

        const query = { company: req.user.company };

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { name: searchRegex },
                { email: searchRegex }
            ];
        }

        const options = {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            sort: { [sort]: order === 'asc' ? 1 : -1 },
        };

        if (parseInt(limit, 10) === 0) {
            const allCustomers = await Customer.find(query).sort(options.sort).lean();
            return res.json({ docs: allCustomers, totalDocs: allCustomers.length });
        }

        const result = await Customer.paginate(query, options);

        res.json({
            customers: result.docs,
            totalDocs: result.totalDocs,
            totalPages: result.totalPages,
            currentPage: result.page,
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/customers/:id
// @desc    Get customer details
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const customer = await Customer.findOne({ _id: req.params.id, company: req.user.company });
        if (!customer) return res.status(404).json({ msg: 'Customer not found' });

        // Satış faturaları ve toplamlar
        const invoices = await Invoice.find({ customerOrSupplier: customer._id, company: req.user.company });
        const totalPurchase = invoices.filter(inv => inv.type === 'sale').reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const totalDebt = invoices.filter(inv => inv.status !== 'paid').reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const creditLimit = customer.creditLimit || 0;
        const creditLimitExceeded = creditLimit > 0 && totalDebt > creditLimit;

        // Borç limiti bildirimi
        if (creditLimitExceeded) {
            const existing = await Notification.findOne({
                type: 'credit_limit',
                relatedId: customer._id,
                company: req.user.company,
                read: false
            });
            if (!existing) {
                await Notification.create({
                    type: 'credit_limit',
                    message: `${customer.name} müşterisinin borcu kredi limitini aştı!`,
                    relatedId: customer._id,
                    company: req.user.company
                });
            }
        }

        res.json({
            customer,
            invoices,
            totalPurchase,
            totalDebt,
            creditLimit,
            creditLimitExceeded
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/customers/:id/debt
// @desc    Get total debt of a customer
// @access  Private
router.get('/:id/debt', auth, async (req, res) => {
    try {
        const customer = await Customer.findOne({ _id: req.params.id, company: req.user.company });
        if (!customer) return res.status(404).json({ msg: 'Customer not found' });

        // Müşterinin tüm satış faturalarını bul
        const invoices = await Invoice.find({ customerOrSupplier: customer._id, company: req.user.company, type: 'sale' });
        const totalAmount = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
        const debt = totalAmount - totalPaid;

        res.json({
            customer: { _id: customer._id, name: customer.name },
            totalAmount,
            totalPaid,
            debt
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/customers/:id
// @desc    Update a customer
// @access  Private
router.put('/:id', auth, async (req, res) => {
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { name, email, phone, address, taxNumber, taxOffice, notes, openingBalance, currency } = req.body;
        
        let customer = await Customer.findOne({ _id: req.params.id, company: req.user.company }).session(session);
        if (!customer) {
            await session.abortTransaction();
            return res.status(404).json({ msg: 'Customer not found' });
        }

        const oldBalance = customer.balance || 0;
        const newBalance = openingBalance !== undefined ? Number(openingBalance) : oldBalance;
        const balanceChanged = Math.abs(newBalance - oldBalance) > 0.001;

        // Update customer fields
        const customerFields = { name, email, phone, address, taxNumber, taxOffice, notes, balance: newBalance, currency: currency || customer.currency || 'TRY' };
        Object.keys(customerFields).forEach(key => customerFields[key] === undefined && delete customerFields[key]);

        customer = await Customer.findByIdAndUpdate(
            req.params.id,
            { $set: customerFields },
            { new: true, session }
        );

        // If balance changed, create a transaction record
        if (balanceChanged) {
            const difference = newBalance - oldBalance;
            // Müşteri bakiyesi: pozitif = alacak (müşteri borçlu), negatif = verecek (biz borçlu)
            // Bakiye arttığında (alacak artışı) = income/receivable
            // Bakiye azaldığında (alacak azalışı) = expense
            const transaction = new Transaction({
                type: difference > 0 ? 'income' : 'expense',
                amount: Math.abs(difference),
                currency: customer.currency || 'TRY',
                description: `Manuel bakiye düzeltmesi: ${customer.name} müşterisi ${oldBalance.toFixed(2)} ${customer.currency || 'TRY'} → ${newBalance.toFixed(2)} ${customer.currency || 'TRY'} (${difference > 0 ? 'Alacak artışı: +' : 'Alacak azalışı: '}${difference.toFixed(2)} ${customer.currency || 'TRY'})`,
                date: new Date(),
                customer: customer._id,
                company: req.user.company,
                createdBy: req.user.id
            });
            await transaction.save({ session });
        }

        await session.commitTransaction();
        res.json(customer);
    } catch (err) {
        await session.abortTransaction();
        console.error('Customer update error:', err);
        res.status(500).send('Server Error');
    } finally {
        session.endSession();
    }
});

// @route   DELETE api/customers/:id
// @desc    Delete a customer
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        let customer = await Customer.findOne({ _id: req.params.id, company: req.user.company });
        if (!customer) return res.status(404).json({ msg: 'Customer not found' });
        await Customer.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Customer removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/customers/:id/debt-adjustment
// @desc    Müşteri borcunu manuel olarak düzelt (arttır/azalt)
// @access  Private
router.post('/:id/debt-adjustment', auth, async (req, res) => {
    const { amount, description, accountId } = req.body;
    try {
        const customer = await Customer.findOne({ _id: req.params.id, company: req.user.company });
        if (!customer) return res.status(404).json({ msg: 'Customer not found' });
        if (!amount || amount === 0) return res.status(400).json({ msg: 'Geçerli bir tutar girin.' });
        if (!accountId) return res.status(400).json({ msg: 'Hesap seçimi zorunludur.' });

        const Account = require('../models/Account');
        const account = await Account.findOne({ _id: accountId, company: req.user.company });
        if (!account) return res.status(404).json({ msg: 'Hesap bulunamadı.' });

        // Pozitif amount: borç azaltılır (income), Negatif amount: borç artırılır (expense)
        const transactionType = amount > 0 ? 'income' : 'expense';
        const transaction = new Transaction({
            type: transactionType,
            description: description || 'Borç düzeltme',
            amount: Math.abs(amount),
            date: new Date(),
            customer: customer._id,
            company: req.user.company,
            targetAccount: account._id,
            createdBy: req.user.id
        });
        await transaction.save();

        // Hesap bakiyesini güncelle
        account.balance += amount;
        await account.save();

        res.json({ msg: 'Borç düzeltme işlemi kaydedildi.', transaction });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Borç düzeltme sırasında hata oluştu.' });
    }
});

// @route   POST api/customers/:id/adjust-balance
// @desc    Manually adjust customer balance with confirmation
// @access  Private
router.post('/:id/adjust-balance', auth, async (req, res) => {
    try {
        const { newBalance, reason, confirmation } = req.body;

        if (!confirmation) {
            return res.status(400).json({ error: 'Onay gerekli. İşlemi onaylamak için confirmation: true gönderin.' });
        }

        const customer = await Customer.findOne({ _id: req.params.id, company: req.user.company });
        if (!customer) {
            return res.status(404).json({ error: 'Müşteri bulunamadı.' });
        }

        const oldBalance = customer.balance;
        const difference = newBalance - oldBalance;

        if (difference === 0) {
            return res.status(400).json({ error: 'Yeni bakiye mevcut bakiye ile aynı.' });
        }

        // Create adjustment transaction
        const transaction = new Transaction({
            type: difference > 0 ? 'receivable' : 'income',
            description: `Manuel bakiye düzeltmesi: ${reason || 'Sebep belirtilmedi'} (Eski: ${oldBalance.toFixed(2)} TL, Yeni: ${newBalance.toFixed(2)} TL)`,
            amount: Math.abs(difference),
            date: new Date(),
            customer: customer._id,
            company: req.user.company,
            createdBy: req.user.id
        });
        await transaction.save();

        // Update customer balance
        customer.balance = newBalance;
        await customer.save();

        res.json({ 
            success: true, 
            message: 'Bakiye başarıyla güncellendi.',
            oldBalance,
            newBalance,
            difference,
            transaction 
        });
    } catch (err) {
        console.error('Adjust balance error:', err);
        res.status(500).json({ error: 'Bakiye düzeltilirken hata oluştu.', details: err.message });
    }
});

module.exports = router;
