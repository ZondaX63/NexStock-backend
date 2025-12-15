const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const StockMovement = require('../models/StockMovement');
const Product = require('../models/Product');

// @route   GET api/movements/product/:productId
// @desc    Get all stock movements for a specific product
// @access  Private
router.get('/product/:productId', auth, async (req, res) => {
    try {
        if (!req.user || !req.user.company) {
            return res.status(401).json({ msg: 'Yetkisiz istek: şirket bilgisi eksik.' });
        }
        if (!req.params.productId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Geçersiz ürün ID.' });
        }
        const product = await Product.findOne({ _id: req.params.productId, company: req.user.company });
        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }
        const movements = await StockMovement.find({ product: req.params.productId, company: req.user.company })
            .populate('invoice', 'invoiceNumber')
            .sort({ date: -1 });
        res.json({ product, movements });
    } catch (err) {
        console.error('Stock movement error:', err, {
            productId: req.params.productId,
            user: req.user
        });
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

module.exports = router; 