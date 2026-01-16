const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const { getExchangeRates } = require('../services/currencyService');

// @route   GET api/currency
// @desc    Get current exchange rates (USD/TRY, EUR/TRY)
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const rates = await getExchangeRates();
        res.json(rates);
    } catch (err) {
        console.error('Currency route error:', err.message);
        res.status(500).json({ msg: 'Döviz kurları alınamadı' });
    }
});

module.exports = router;
