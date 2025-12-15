const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/authMiddleware');
const Invoice = require('../models/Invoice');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const Account = require('../models/Account');

// Borç/Alacak Listesi (müşteri ve tedarikçi bazlı)
router.get('/debt-credit', [auth, admin], async (req, res) => {
    try {
        const company = req.user.company;
        
        // Müşteri Bakiyeleri (Alacaklarımız)
        // balance > 0 means they owe us (Receivable)
        const customerDebts = await require('../models/Customer').find({ 
            company, 
            balance: { $ne: 0 } 
        }).select('name balance email phone');

        // Tedarikçi Bakiyeleri (Borçlarımız)
        // balance > 0 means we owe them (Payable)
        const supplierDebts = await require('../models/Supplier').find({ 
            company, 
            balance: { $ne: 0 } 
        }).select('name balance email phone');

        res.json({ customerDebts, supplierDebts });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Gelir/Gider Raporu
router.get('/income-expense', [auth, admin], async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let filter = {};
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }
        const income = await Transaction.aggregate([
            { $match: { ...filter, type: 'income' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const expense = await Transaction.aggregate([
            { $match: { ...filter, type: 'expense' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        res.json({ income: income[0]?.total || 0, expense: expense[0]?.total || 0 });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Stok Hareket Raporu
router.get('/stock-movements', [auth, admin], async (req, res) => {
    try {
        const products = await Product.find();
        // Basit stok durumu ve hareket özeti
        const stockReport = products.map(p => ({
            name: p.name,
            sku: p.sku,
            quantity: p.quantity,
            criticalStockLevel: p.criticalStockLevel,
            isCritical: p.quantity <= p.criticalStockLevel
        }));
        res.json(stockReport);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Nakit Akışı Grafiği (tarih aralığına göre)
router.get('/cash-flow', [auth, admin], async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let filter = {};
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }
        const cashFlow = await Transaction.find(filter).sort('date');
        res.json(cashFlow);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/reports/cash
// @desc    Kasa raporları: günlük gelir/gider, nakit/kredi kartı toplamı, kategori dağılımı
// @access  Private
router.get('/cash', require('../middleware/authMiddleware').auth, async (req, res) => {
  const { startDate, endDate, accountType } = req.query;
  const company = req.user.company;
  const match = { company };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }
  // Hesap tipine göre filtre
  let accountIds = [];
  if (accountType) {
    const accounts = await Account.find({ company, type: accountType });
    accountIds = accounts.map(a => a._id.toString());
    match.$or = [
      { account: { $in: accountIds } },
      { sourceAccount: { $in: accountIds } },
      { targetAccount: { $in: accountIds } }
    ];
  }
  // Günlük gelir/gider
  const daily = await Transaction.aggregate([
    { $match: match },
    { $addFields: { dateStr: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } },
    { $group: {
      _id: { date: '$dateStr', type: '$type' },
      total: { $sum: '$amount' }
    }},
    { $group: {
      _id: '$_id.date',
      data: { $push: { type: '$_id.type', total: '$total' } }
    }},
    { $sort: { _id: 1 } }
  ]);
  // Nakit/kredi kartı toplamı
  const accounts = await Account.find({ company });
  const typeTotals = {};
  for (const acc of accounts) {
    typeTotals[acc.type] = (typeTotals[acc.type] || 0) + acc.balance;
  }
  // Gelir/gider kategorileri (örnek: description veya custom field ile kategorize edilebilir)
  const categoryAgg = await Transaction.aggregate([
    { $match: match },
    { $group: {
      _id: { type: '$type', category: '$category' },
      total: { $sum: '$amount' }
    }},
    { $sort: { total: -1 } }
  ]);
  res.json({
    daily,
    typeTotals,
    categoryAgg
  });
});

module.exports = router;
