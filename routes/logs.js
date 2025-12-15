const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware').auth;
const Log = require('../models/Log');

// @route   GET api/logs
// @desc    Log kayıtlarını listele
// @access  Private
router.get('/', auth, async (req, res) => {
  const { module, targetId } = req.query;
  const query = { company: req.user.company };
  if (module) query.module = module;
  if (targetId) query.targetId = targetId;
  const logs = await Log.find(query).populate('user', 'name').sort({ date: -1 }).limit(100);
  res.json(logs);
});

module.exports = router; 