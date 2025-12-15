const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth, admin } = require('../middleware/authMiddleware');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const Notification = require('../models/Notification');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Supplier = require('../models/Supplier');
const { recomputePartnerBalances, recomputeAccountBalance } = require('../services/accountingService');

// @route   GET api/invoices/stats
// @desc    Get invoice statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
    try {
        const allInvoices = await Invoice.find({ company: req.user.company });
        const stats = {
            totalIn: allInvoices.filter(inv => inv.type === 'purchase').length,
            totalOut: allInvoices.filter(inv => inv.type === 'sale').length,
            totalDraft: allInvoices.filter(inv => inv.status === 'draft').length,
            totalApproved: allInvoices.filter(inv => inv.status === 'approved').length,
            totalPaid: allInvoices.filter(inv => inv.status === 'paid').length,
            totalAmount: allInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
        };
        res.json(stats);
    } catch (err) {
        console.error('Error in /stats endpoint:', err);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/invoices/due-soon
// @desc    Get invoices with due dates within 3 days
// @access  Private
router.get('/due-soon', auth, async (req, res) => {
    try {
        const now = new Date();
        const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        const invoices = await Invoice.find({
            company: req.user.company,
            dueDate: { $gte: now, $lte: soon },
            status: { $ne: 'paid' }
        });

        for (const invoice of invoices) {
            const existing = await Notification.findOne({
                type: 'due_date',
                relatedId: invoice._id,
                company: req.user.company,
            });
            if (!existing) {
                await Notification.create({
                    type: 'due_date',
                    message: `Fatura #${invoice.invoiceNumber || invoice._id} vadesi yaklaşıyor.`,
                    relatedId: invoice._id,
                    company: req.user.company
                });
            }
        }
        res.json({ msg: `${invoices.length} adet faturanın vadesi yaklaşıyor.` });
    } catch (err) {
        console.error('Error in /due-soon route:', err);
        res.status(500).json({ msg: 'Server error while fetching due invoices.' });
    }
});

// @route   GET api/invoices
// @desc    Get all invoices with pagination
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, sort = 'date', order = 'desc', search = '', customer, supplier, type, status } = req.query;
        const query = { company: req.user.company };

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [{ invoiceNumber: searchRegex }];
        }
        if (customer) query.customerOrSupplier = customer;
        if (supplier) query.customerOrSupplier = supplier;
        if (type) query.type = type;
        if (status) query.status = status;

        const options = {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10) === 0 ? undefined : parseInt(limit, 10),
            sort: { [sort]: order === 'asc' ? 1 : -1 }
        };

        const populatePartner = async (invoices) => {
            return Promise.all(invoices.map(async (invoice) => {
                const invoiceObj = invoice.toObject();
                if (invoice.partnerModel === 'Customer') {
                    const customer = await Customer.findById(invoice.customerOrSupplier).select('name');
                    invoiceObj.customerOrSupplier = customer;
                } else if (invoice.partnerModel === 'Supplier') {
                    const supplier = await Supplier.findById(invoice.customerOrSupplier).select('name');
                    invoiceObj.customerOrSupplier = supplier;
                }
                return invoiceObj;
            }));
        };

        if (parseInt(limit, 10) === 0) {
            const invoices = await Invoice.find(query).sort(options.sort);
            const populatedInvoices = await populatePartner(invoices);
            return res.json({ docs: populatedInvoices });
        }

        const result = await Invoice.paginate(query, options);
        const populatedInvoices = await populatePartner(result.docs);

        res.json({
            invoices: populatedInvoices,
            totalInvoices: result.totalDocs,
            totalPages: result.totalPages,
            currentPage: result.page
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/invoices/:id
// @desc    Get invoice by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id).populate('products.product');
        if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });

        const invoiceObj = invoice.toObject();
        if (invoice.partnerModel === 'Customer') {
            const customer = await Customer.findById(invoice.customerOrSupplier).select('name');
            invoiceObj.customerOrSupplier = customer;
        } else if (invoice.partnerModel === 'Supplier') {
            const supplier = await Supplier.findById(invoice.customerOrSupplier).select('name');
            invoiceObj.customerOrSupplier = supplier;
        }
        res.json(invoiceObj);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/invoices
// @desc    Create an invoice (as draft)
// @access  Private
router.post('/', auth, async (req, res) => {
    const { invoiceNumber, customerOrSupplier, partnerModel, products, totalAmount, type, date, dueDate, vat, discount1, discount2, discount3, discount4, currency, exchangeRate } = req.body;

    if (customerOrSupplier && !mongoose.Types.ObjectId.isValid(customerOrSupplier)) {
        return res.status(400).json({ msg: 'Invalid customer or supplier ID' });
    }

    try {
        const newInvoice = new Invoice({
            invoiceNumber,
            customerOrSupplier,
            partnerModel,
            products,
            totalAmount,
            type,
            date,
            dueDate,
            vat,
            discount1,
            discount2,
            discount3,
            discount4,
            currency,
            exchangeRate,
            company: req.user.company,
            status: 'draft'
        });
        const invoice = await newInvoice.save();

        if (dueDate && new Date(dueDate) - new Date() < 4 * 24 * 60 * 60 * 1000) {
            await Notification.create({
                type: 'due_date',
                message: `${invoice.invoiceNumber || 'Fatura'} vadesi yaklaşıyor!`,
                relatedId: invoice._id,
                company: req.user.company
            });
        }
        res.json(invoice);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/invoices/:id
// @desc    Update an invoice
// @access  Private
router.put('/:id', auth, async (req, res) => {
    const { invoiceNumber, customerOrSupplier, partnerModel, products, totalAmount, type, date, currency, exchangeRate } = req.body;
    const invoiceFields = { invoiceNumber, customerOrSupplier, partnerModel, products, totalAmount, type, date, currency, exchangeRate };

    try {
        let invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company });
        if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });
        if (invoice.status !== 'draft' && req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Sadece taslak faturalar düzenlenebilir.' });
        }
        invoice = await Invoice.findByIdAndUpdate(req.params.id, { $set: invoiceFields }, { new: true });
        res.json(invoice);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/invoices/:id
// @desc    Delete an invoice
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        let invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company }).session(session);
        if (!invoice) throw new Error('Invoice not found');

        if (invoice.status === 'approved') {
            if (req.user.role !== 'admin') {
                throw new Error('Sadece adminler onaylı faturaları silebilir.');
            }
            
            // Reverse Stock
            if (invoice.type === 'sale') {
                for (const item of invoice.products) {
                    const product = await Product.findById(item.product).session(session);
                    if (product) {
                        product.quantity += item.quantity;
                        await product.save({ session });
                    }
                }
            } else {
                // Purchase
                for (const item of invoice.products) {
                    const product = await Product.findById(item.product).session(session);
                    if (product) {
                        product.quantity -= item.quantity;
                        await product.save({ session });
                    }
                }
            }

            // Delete related accrual transaction
            await Transaction.deleteMany({ relatedInvoice: invoice._id }).session(session);
            
            // Delete stock movements
            await StockMovement.deleteMany({ invoice: invoice._id }).session(session);
        }

        await Invoice.findByIdAndDelete(req.params.id).session(session);
        
        await session.commitTransaction();

        // Recompute balances if it was approved (since it affected balances)
        if (invoice.status === 'approved') {
            await recomputePartnerBalances(req.user.company);
        }

        res.json({ msg: 'Invoice removed' });
    } catch (err) {
        await session.abortTransaction();
        console.error(err.message);
        res.status(500).send(err.message || 'Server Error');
    } finally {
        session.endSession();
    }
});

// @route   POST api/invoices/:id/approve
// @desc    Approve an invoice -> Update Stock -> Create Accrual Transaction -> Update Balance
// @access  Private/Admin
router.post('/:id/approve', [auth, admin], async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company }).session(session);
        if (!invoice) throw new Error('Invoice not found');
        if (invoice.status === 'approved') throw new Error('Invoice is already approved');

        // 1. Stock Logic
        if (invoice.type === 'sale') {
            for (const item of invoice.products) {
                const product = await Product.findById(item.product).session(session);
                if (!product) throw new Error(`Product ${item.product} not found`);
                if (product.quantity < item.quantity) throw new Error(`Insufficient stock: ${product.name}`);

                product.quantity -= item.quantity;
                await product.save({ session });

                await StockMovement.create([{
                    product: item.product,
                    invoice: invoice._id,
                    type: 'out',
                    quantity: item.quantity,
                    company: req.user.company
                }], { session });
            }
        } else {
            // Purchase
            for (const item of invoice.products) {
                const product = await Product.findById(item.product).session(session);
                if (!product) throw new Error(`Product ${item.product} not found`);

                product.quantity += item.quantity;
                await product.save({ session });

                await StockMovement.create([{
                    product: item.product,
                    invoice: invoice._id,
                    type: 'in',
                    quantity: item.quantity,
                    company: req.user.company
                }], { session });
            }
        }

        // 2. Accounting Logic (Unified Ledger)
        const transaction = new Transaction({
            type: 'invoice_accrual',
            description: `Fatura Onayı: ${invoice.invoiceNumber}`,
            amount: invoice.totalAmount,
            date: new Date(),
            relatedInvoice: invoice._id,
            customer: invoice.partnerModel === 'Customer' ? invoice.customerOrSupplier : undefined,
            supplier: invoice.partnerModel === 'Supplier' ? invoice.customerOrSupplier : undefined,
            company: req.user.company,
            createdBy: req.user.id
        });
        await transaction.save({ session });

        invoice.status = 'approved';
        await invoice.save({ session });

        await session.commitTransaction();
        
        // Recompute Partner Balances (outside transaction to avoid locking issues if service uses separate connection/logic)
        // Ideally should be inside, but our service is simple.
        await recomputePartnerBalances(req.user.company);

        res.json(invoice);
    } catch (err) {
        await session.abortTransaction();
        console.error(err.message);
        res.status(500).send(err.message);
    } finally {
        session.endSession();
    }
});

// @route   POST api/invoices/:id/collect
// @desc    Tahsilat (Sale Invoice) -> Income Transaction -> Update Account -> Decrease Customer Balance
// @access  Private
router.post('/:id/collect', auth, async (req, res) => {
    const { amount, accountId } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company }).session(session);
        if (!invoice) throw new Error('Invoice not found');
        if (invoice.status !== 'approved' && invoice.status !== 'paid') throw new Error('Invalid invoice status');
        if (invoice.paidAmount >= invoice.totalAmount) throw new Error('Invoice already fully paid');

        const account = await Account.findOne({ _id: accountId, company: req.user.company }).session(session);
        if (!account) throw new Error('Account not found');

        // 1. Create Transaction
        const transaction = new Transaction({
            type: 'income',
            description: `Tahsilat: ${invoice.invoiceNumber}`,
            amount: Number(amount),
            date: new Date(),
            relatedInvoice: invoice._id,
            customer: invoice.partnerModel === 'Customer' ? invoice.customerOrSupplier : undefined,
            supplier: invoice.partnerModel === 'Supplier' ? invoice.customerOrSupplier : undefined,
            company: req.user.company,
            targetAccount: account._id,
            createdBy: req.user.id
        });
        await transaction.save({ session });

        // 2. Update Account Balance
        account.balance += Number(amount);
        await account.save({ session });

        // 3. Update Customer Balance (Decrease Receivable)
        if (invoice.partnerModel === 'Customer') {
            const customer = await Customer.findById(invoice.customerOrSupplier).session(session);
            if (customer) {
                customer.balance -= Number(amount);
                await customer.save({ session });
            }
        }

        // 4. Update Invoice
        invoice.paidAmount = (invoice.paidAmount || 0) + Number(amount);
        if (invoice.paidAmount >= invoice.totalAmount) {
            invoice.status = 'paid';
        }
        await invoice.save({ session });

        await session.commitTransaction();
        
        // Recompute balances to ensure consistency
        await recomputeAccountBalance(account);
        await recomputePartnerBalances(req.user.company);
        
        res.json({ msg: 'Collection successful', invoice, transaction });
    } catch (err) {
        await session.abortTransaction();
        console.error(err);
        res.status(500).json({ msg: err.message || 'Server Error' });
    } finally {
        session.endSession();
    }
});

// @route   POST api/invoices/:id/pay
// @desc    Ödeme (Purchase Invoice) -> Expense Transaction -> Update Account -> Decrease Supplier Balance
// @access  Private
router.post('/:id/pay', auth, async (req, res) => {
    const { amount, accountId } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company }).session(session);
        if (!invoice) throw new Error('Invoice not found');
        if (invoice.type !== 'purchase') throw new Error('Not a purchase invoice');

        const account = await Account.findOne({ _id: accountId, company: req.user.company }).session(session);
        if (!account) throw new Error('Account not found');
        if (account.balance < amount) throw new Error('Insufficient funds');

        // 1. Create Transaction
        const transaction = new Transaction({
            type: 'expense',
            description: `Ödeme: ${invoice.invoiceNumber}`,
            amount: Number(amount),
            date: new Date(),
            relatedInvoice: invoice._id,
            supplier: invoice.partnerModel === 'Supplier' ? invoice.customerOrSupplier : undefined,
            company: req.user.company,
            sourceAccount: account._id,
            createdBy: req.user.id
        });
        await transaction.save({ session });

        // 2. Update Account Balance
        account.balance -= Number(amount);
        await account.save({ session });

        // 3. Update Supplier Balance (Decrease Payable)
        if (invoice.partnerModel === 'Supplier') {
            const supplier = await Supplier.findById(invoice.customerOrSupplier).session(session);
            if (supplier) {
                supplier.balance -= Number(amount);
                await supplier.save({ session });
            }
        }

        // 4. Update Invoice
        invoice.paidAmount = (invoice.paidAmount || 0) + Number(amount);
        if (invoice.paidAmount >= invoice.totalAmount) {
            invoice.status = 'paid';
        }
        await invoice.save({ session });

        await session.commitTransaction();
        
        // Recompute balances
        await recomputeAccountBalance(account);
        await recomputePartnerBalances(req.user.company);
        
        res.json({ msg: 'Payment successful', invoice, transaction });
    } catch (err) {
        await session.abortTransaction();
        console.error(err);
        res.status(500).json({ msg: err.message || 'Server Error' });
    } finally {
        session.endSession();
    }
});

// @route   PATCH api/invoices/:id/status
// @desc    Update invoice status (draft, approved, paid, canceled) - Manual override
// @access  Private
router.patch('/:id/status', auth, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['draft', 'approved', 'paid', 'canceled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ msg: 'Geçersiz durum.' });
        }

        const invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company });
        if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });

        // Warning: Manual status change might break consistency if not careful.
        // For now, allow it but maybe log a warning or restrict to admin.
        invoice.status = status;
        await invoice.save();

        res.json({ msg: 'Fatura durumu güncellendi', invoice });
    } catch (err) {
        console.error('PATCH /invoices/:id/status', err);
        res.status(500).json({ msg: 'Fatura durumu güncellenemedi.' });
    }
});

module.exports = router;
