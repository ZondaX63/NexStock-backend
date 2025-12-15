const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');

// Ürün adı için otomatik tamamlama
router.get('/products', auth, async (req, res) => {
    try {
        const { q } = req.query;
        const products = await Product.find({ name: { $regex: q || '', $options: 'i' } }).limit(10);
        res.json(products);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Müşteri adı için otomatik tamamlama
router.get('/customers', auth, async (req, res) => {
    try {
        const { q } = req.query;
        const customers = await Customer.find({ name: { $regex: q || '', $options: 'i' } }).limit(10);
        res.json(customers);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/autocomplete/categories
// @desc    Get all categories for autocomplete
// @access  Private
router.get('/categories', auth, async (req, res) => {
    try {
        const categories = await Category.find({ company: req.user.company }).select('name');
        res.json(categories);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/autocomplete/suppliers
// @desc    Get all suppliers for autocomplete
// @access  Private
router.get('/suppliers', auth, async (req, res) => {
    try {
        const suppliers = await Supplier.find({ company: req.user.company }).select('name');
        res.json(suppliers);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
