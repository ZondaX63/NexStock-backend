const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const aiController = require('../controllers/aiController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// @route   POST api/ai/analyze-receipt
// @desc    Analyze receipt photo and extract data
// @access  Private
router.post('/analyze-receipt', auth, upload.single('image'), aiController.analyzeReceipt);

// @route   GET api/ai/insights
// @desc    Get AI-generated business insights based on dashboard data
// @access  Private
router.get('/insights', auth, aiController.getDashboardInsights);

// @route   POST api/ai/chat
// @desc    Chat with AI about business data
// @access  Private
router.post('/chat', auth, aiController.chatWithData);

// @route   POST api/ai/generate-description
// @desc    Generate a product description based on name and category
// @access  Private
router.post('/generate-description', auth, aiController.generateDescription);

// @route   GET api/ai/predict-stock/:productId
// @desc    Predict stock exhaustion and reorder point
// @access  Private
router.get('/predict-stock/:productId', auth, aiController.predictStock);

// @route   POST api/ai/generate-email
// @desc    Generate professional email for invoice/offer
// @access  Private
router.post('/generate-email', auth, aiController.generateEmail);

// @route   POST api/ai/semantic-search
// @desc    AI-powered search suggestions for products
// @access  Private
router.post('/semantic-search', auth, aiController.semanticSearch);

module.exports = router;
