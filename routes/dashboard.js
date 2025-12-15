const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');

// @route   GET api/dashboard/stats
// @desc    Get dashboard stats
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const companyId = req.user.company;
    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));

    const productStats = await Product.aggregate([
      { $match: { company: companyId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          lowStock: { $sum: { $cond: [{ $lte: ['$quantity', '$criticalStockLevel'] }, 1, 0] } }
        }
      }
    ]);

    const customerCount = await Customer.countDocuments({ company: companyId });

    const invoiceStats = await Invoice.aggregate([
      { $match: { company: companyId, status: 'approved' } },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    const sales = invoiceStats.find(i => i._id === 'sale')?.totalAmount || 0;
    const purchases = invoiceStats.find(i => i._id === 'purchase')?.totalAmount || 0;

    const recentActivity = await Invoice.find({ company: companyId, status: 'approved' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate({ path: 'customerOrSupplier', select: 'name', model: null });

    // Invoice stats for cash flow (last 30 days)
    const cashFlowData = await Invoice.aggregate([
      {
        $match: {
          company: companyId,
          status: 'approved',
          date: { $gte: thirtyDaysAgo, $lte: today }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          sales: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$totalAmount", 0] } },
          purchases: { $sum: { $cond: [{ $eq: ["$type", "purchase"] }, "$totalAmount", 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Due invoices (upcoming or past due)
    const dueInvoices = await Invoice.find({
      company: companyId,
      status: 'draft', // Only unpaid invoices
      dueDate: { $exists: true }
    }).sort({ dueDate: 'asc' }).limit(10)
      .populate({ path: 'customerOrSupplier', select: 'name', model: null });

    res.json({
      products: productStats[0] || { total: 0, lowStock: 0 },
      customers: customerCount,
      sales,
      purchases,
      balance: (sales || 0) - (purchases || 0),
      recentActivity,
      cashFlow: cashFlowData,
      dueInvoices: dueInvoices,
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/dashboard/summary
// @desc    Dashboard özet verileri
// @access  Private
router.get('/summary', auth, async (req, res) => {
  try {
    const company = req.user.company;

    if (!company) {
      return res.status(400).json({ msg: 'Company not found in user data' });
    }

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);

    // Son 7 gün satış grafiği
    const sales = await Invoice.aggregate([
      { $match: { company, type: 'sale', date: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Kritik stoklar
    const criticalStocks = await Product.find({
      company,
      trackStock: true,
      $expr: { $lte: ["$quantity", "$criticalStockLevel"] }
    }).select('name quantity criticalStockLevel');

    // Son 2 ay gelir/gider
    const firstDayPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
    const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const now = new Date();

    const txPrevMonth = await Transaction.aggregate([
      { $match: { company, date: { $gte: firstDayPrevMonth, $lte: lastDayPrevMonth } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } }
    ]);

    const txThisMonth = await Transaction.aggregate([
      { $match: { company, date: { $gte: firstDayThisMonth, $lte: now } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } }
    ]);

    function getTotal(arr, type) {
      const found = arr.find(x => x._id === type);
      return found ? found.total : 0;
    }

    const monthly = {
      prev: { income: getTotal(txPrevMonth, 'income'), expense: getTotal(txPrevMonth, 'expense') },
      current: { income: getTotal(txThisMonth, 'income'), expense: getTotal(txThisMonth, 'expense') }
    };

    // En çok satan ürünler (son 30 gün)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);

    const topProducts = await Invoice.aggregate([
      { $match: { company, type: 'sale', date: { $gte: thirtyDaysAgo } } },
      { $unwind: '$products' },
      {
        $group: {
          _id: '$products.product',
          totalSold: { $sum: '$products.quantity' }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      { $unwind: '$productInfo' },
      { $project: { name: '$productInfo.name', totalSold: 1 } }
    ]);

    // Upcoming Payments (Purchase invoices due soon, not paid)
    const upcomingPayments = await Invoice.find({
      company,
      type: 'purchase',
      status: { $ne: 'paid' },
      dueDate: { $gte: today }
    }).sort({ dueDate: 1 }).limit(5).populate('customerOrSupplier', 'name');

    // Pending Invoices (Sales invoices approved but not fully paid)
    const pendingInvoices = await Invoice.find({
      company,
      type: 'sale',
      status: 'approved',
      $expr: { $lt: ["$paidAmount", "$totalAmount"] }
    }).sort({ date: -1 }).limit(5).populate('customerOrSupplier', 'name');

    res.json({
      sales,
      criticalStocks,
      monthly,
      topProducts,
      upcomingPayments,
      pendingInvoices
    });

  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ msg: 'Dashboard summary error' });
  }
});

module.exports = router;