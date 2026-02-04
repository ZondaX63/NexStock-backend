const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/authMiddleware');
const Supplier = require('../models/Supplier');
const Invoice = require('../models/Invoice');

// @route   POST api/suppliers
// @desc    Create a supplier
// @access  Private
router.post('/', auth, async (req, res) => {
    const { name, contactPerson, email, phone } = req.body;
    try {
        const newSupplier = new Supplier({
            name,
            contactPerson,
            email,
            phone,
            company: req.user.company
        });
        const supplier = await newSupplier.save();
        res.json(supplier);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/suppliers
// @desc    Get all suppliers with pagination
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, sort = 'name', order = 'asc', search = '' } = req.query;

        const query = { company: req.user.company };

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { name: searchRegex },
                { contactPerson: searchRegex },
                { email: searchRegex }
            ];
        }

        const options = {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            sort: { [sort]: order === 'asc' ? 1 : -1 },
        };

        if (parseInt(limit, 10) === 0) {
            const allSuppliers = await Supplier.find(query).sort(options.sort).lean();
            return res.json({ docs: allSuppliers, totalDocs: allSuppliers.length });
        }

        const result = await Supplier.paginate(query, options);

        res.json({
            suppliers: result.docs,
            totalDocs: result.totalDocs,
            totalPages: result.totalPages,
            currentPage: result.page,
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/suppliers/:id
// @desc    Get supplier details
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const supplier = await Supplier.findOne({ _id: req.params.id, company: req.user.company });
        if (!supplier) return res.status(404).json({ msg: 'Supplier not found' });
        const invoices = await Invoice.find({ customerOrSupplier: supplier._id, company: req.user.company });
        const totalPurchase = invoices.filter(inv => inv.type === 'purchase').reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const totalDebt = invoices.filter(inv => inv.status !== 'paid').reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const creditLimit = supplier.creditLimit || 0;
        const creditLimitExceeded = creditLimit > 0 && totalDebt > creditLimit;
        res.json({
            supplier,
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

// @route   PUT api/suppliers/:id
// @desc    Update a supplier
// @access  Private
router.put('/:id', auth, async (req, res) => {
    const mongoose = require('mongoose');
    const Transaction = require('../models/Transaction');
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { name, contactPerson, email, phone, taxNumber, taxOffice, notes, openingBalance, currency } = req.body;
        
        let supplier = await Supplier.findOne({ _id: req.params.id, company: req.user.company }).session(session);
        if (!supplier) {
            await session.abortTransaction();
            return res.status(404).json({ msg: 'Supplier not found' });
        }

        const oldBalance = supplier.balance || 0;
        const newBalance = openingBalance !== undefined ? Number(openingBalance) : oldBalance;
        const balanceChanged = Math.abs(newBalance - oldBalance) > 0.001;

        // Update supplier fields
        const supplierFields = { name, contactPerson, email, phone, taxNumber, taxOffice, notes, balance: newBalance, currency: currency || supplier.currency || 'TRY' };
        Object.keys(supplierFields).forEach(key => supplierFields[key] === undefined && delete supplierFields[key]);

        supplier = await Supplier.findByIdAndUpdate(
            req.params.id,
            { $set: supplierFields },
            { new: true, session }
        );

        // If balance changed, create a transaction record
        if (balanceChanged) {
            const difference = newBalance - oldBalance;
            // Tedarikçi bakiyesi: pozitif = borç (biz borçluyuz), negatif = alacak (tedarikçi borçlu)
            // Bakiye arttığında (borç artışı) = expense
            // Bakiye azaldığında (borç azalışı) = income
            const transaction = new Transaction({
                type: difference > 0 ? 'expense' : 'income',
                amount: Math.abs(difference),
                currency: supplier.currency || 'TRY',
                description: `Manuel bakiye düzeltmesi: ${supplier.name} tedarikçisi ${oldBalance.toFixed(2)} ${supplier.currency || 'TRY'} → ${newBalance.toFixed(2)} ${supplier.currency || 'TRY'} (${difference > 0 ? 'Borç artışı: +' : 'Borç azalışı: '}${difference.toFixed(2)} ${supplier.currency || 'TRY'})`,
                date: new Date(),
                supplier: supplier._id,
                company: req.user.company,
                createdBy: req.user.id
            });
            await transaction.save({ session });
        }

        await session.commitTransaction();
        res.json(supplier);
    } catch (err) {
        await session.abortTransaction();
        console.error('Supplier update error:', err);
        res.status(500).send('Server Error');
    } finally {
        session.endSession();
    }
});

// @route   DELETE api/suppliers/:id
// @desc    Delete a supplier
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        let supplier = await Supplier.findOne({ _id: req.params.id, company: req.user.company });
        if (!supplier) return res.status(404).json({ msg: 'Supplier not found' });
        await Supplier.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Supplier removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/suppliers/:id/debt
// @desc    Get total debt of a supplier
// @access  Private
router.get('/:id/debt', auth, async (req, res) => {
    try {
        const supplier = await Supplier.findOne({ _id: req.params.id, company: req.user.company });
        if (!supplier) return res.status(404).json({ msg: 'Supplier not found' });

        // Tedarikçinin tüm satın alma faturalarını bul
        const invoices = await Invoice.find({ customerOrSupplier: supplier._id, company: req.user.company, type: 'purchase' });
        const totalAmount = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
        const debt = totalAmount - totalPaid;

        res.json({
            supplier: { _id: supplier._id, name: supplier.name },
            totalAmount,
            totalPaid,
            debt
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
