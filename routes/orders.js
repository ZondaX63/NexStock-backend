const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const Order = require('../models/Order');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');

// @route   GET api/orders
// @desc    Get all orders
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const orders = await Order.find({ company: req.user.company })
            .populate('supplier', 'name email phone')
            .sort({ date: -1 });
        res.json(orders);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/orders/:id
// @desc    Get order by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('supplier', 'name email phone')
            .populate('products.product', 'name sku');

        if (!order) return res.status(404).json({ msg: 'Order not found' });
        if (order.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        res.json(order);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/orders
// @desc    Create a new order
// @access  Private
router.post('/', auth, async (req, res) => {
    const { orderNumber, supplier, products, totalAmount, currency, exchangeRate, date, expectedDeliveryDate, description } = req.body;

    try {
        const newOrder = new Order({
            orderNumber,
            supplier,
            products,
            totalAmount,
            currency,
            exchangeRate,
            date,
            expectedDeliveryDate,
            description,
            company: req.user.company,
            status: 'draft'
        });

        const order = await newOrder.save();
        res.json(order);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/orders/:id/convert-to-invoice
// @desc    Convert order to invoice
// @access  Private
router.post('/:id/convert-to-invoice', auth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ msg: 'Order not found' });
        if (order.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        // Create invoice from order
        const invoiceNumber = 'INV-' + Date.now(); // Simple generation

        const newInvoice = new Invoice({
            invoiceNumber,
            customerOrSupplier: order.supplier,
            partnerModel: 'Supplier',
            products: order.products.map(p => ({
                product: p.product,
                quantity: p.quantity,
                price: p.unitPrice,
                vat: p.taxRate,
                discount1: p.discount
            })),
            totalAmount: order.totalAmount,
            currency: order.currency,
            exchangeRate: order.exchangeRate,
            date: new Date(),
            type: 'purchase',
            status: 'draft',
            company: req.user.company
        });

        const invoice = await newInvoice.save();

        // Update order status
        order.status = 'delivered'; // Assuming delivered/completed
        await order.save();

        res.json(invoice);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/orders/:id
// @desc    Update an order
// @access  Private
router.put('/:id', auth, async (req, res) => {
    const { orderNumber, supplier, products, totalAmount, currency, exchangeRate, date, expectedDeliveryDate, status, description } = req.body;

    const orderFields = { orderNumber, supplier, products, totalAmount, currency, exchangeRate, date, expectedDeliveryDate, status, description };

    try {
        let order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ msg: 'Order not found' });
        if (order.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        order = await Order.findByIdAndUpdate(
            req.params.id,
            { $set: orderFields },
            { new: true }
        );

        res.json(order);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/orders/:id
// @desc    Delete an order
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ msg: 'Order not found' });
        if (order.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        await Order.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Order removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
