const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Customer = require('../models/Customer');

// POST /api/pos/sale - Full-featured retail sale
// body: { 
//   items: [{ productId, quantity, price }], 
//   payment: { accountId, method, amount, receivedAmount }, 
//   customerId (optional),
//   notes,
//   onCredit (optional) - if true, add to customer balance instead of receiving payment
// }
router.post('/sale', auth, async (req, res) => {
  try {
    const { items, payment, customerId, notes, onCredit } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Satış için en az bir ürün gerekli.' });
    }
    if (!onCredit && !payment?.accountId) {
      return res.status(400).json({ error: 'Ödeme hesabı seçilmelidir veya veresiye satış yapmalısınız.' });
    }
    if (onCredit && !customerId) {
      return res.status(400).json({ error: 'Veresiye satış için müşteri seçilmelidir.' });
    }

    const company = req.user.company;
    let total = 0;
    const itemDetails = [];

    // Validate and prepare updates
    for (const it of items) {
      const prod = await Product.findOne({ _id: it.productId, company });
      if (!prod) return res.status(404).json({ error: `Ürün bulunamadı: ${it.productId}` });

      const qty = Number(it.quantity || 0);
      if (qty <= 0) return res.status(400).json({ error: `Geçersiz miktar: ${prod.name}` });

      if (prod.trackStock && prod.quantity < qty) {
        return res.status(400).json({ 
          error: `Stokta yeterli ürün yok: ${prod.name}`,
          available: prod.quantity,
          requested: qty
        });
      }

      const price = Number(it.price || prod.salePrice || 0);
      total += (price * qty);
      itemDetails.push({ 
        productId: prod._id, 
        name: prod.name, 
        sku: prod.sku,
        quantity: qty, 
        price,
        subtotal: price * qty
      });
    }

    // Validate account exists (only if not on credit)
    let account = null;
    if (!onCredit) {
      account = await Account.findOne({ _id: payment.accountId, company });
      if (!account) return res.status(404).json({ error: 'Ödeme hesabı bulunamadı.' });
    }

    // Validate customer if provided
    let customer = null;
    if (customerId) {
      customer = await Customer.findOne({ _id: customerId, company });
      if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı.' });
      
      // Check credit limit if on credit
      if (onCredit) {
        const newBalance = customer.balance + total;
        if (customer.creditLimit > 0 && newBalance > customer.creditLimit) {
          return res.status(400).json({ 
            error: `Kredi limiti aşılacak. Limit: ${customer.creditLimit.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}, Mevcut Borç: ${customer.balance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}, Yeni Borç: ${newBalance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}` 
          });
        }
      }
    }

    // Apply updates: decrement product quantities and create stock movements
    for (const it of items) {
      const prod = await Product.findOne({ _id: it.productId, company });
      const qty = Number(it.quantity || 0);
      if (prod.trackStock && qty > 0) {
        prod.quantity = Math.max(0, prod.quantity - qty);
        await prod.save();
        const sm = new StockMovement({ 
          product: prod._id, 
          type: 'out', 
          quantity: qty, 
          company,
          date: new Date()
        });
        await sm.save();
      }
    }

    // Update balances
    if (onCredit) {
      // Add to customer debt (müşteri borcu - bizim alacağımız)
      customer.balance += total;
      await customer.save();
    } else {
      // Add to account balance (kasaya para girişi)
      account.balance += total;
      await account.save();
    }

    // Create a financial transaction
    const desc = notes 
      ? `Perakende satış${onCredit ? ' (Veresiye)' : ''} - ${itemDetails.length} ürün - ${notes}` 
      : `Perakende satış${onCredit ? ' (Veresiye)' : ''} - ${itemDetails.length} ürün`;

    const transaction = new Transaction({
      type: onCredit ? 'receivable' : 'income',
      description: desc,
      amount: total,
      date: new Date(),
      company,
      customer: customerId || undefined,
      targetAccount: onCredit ? undefined : payment.accountId, // Para giriş yapılan hesap
      createdBy: req.user.id || req.user._id,
      items: itemDetails,
    });
    await transaction.save();

    res.json({ 
      success: true,
      message: onCredit ? 'Veresiye satış başarıyla kaydedildi.' : 'Satış başarıyla kaydedildi.',
      saleId: transaction._id,
      total,
      items: itemDetails,
      onCredit,
      account: onCredit ? null : { id: account._id, name: account.name, newBalance: account.balance },
      customer: customer ? { id: customer._id, name: customer.name, newBalance: customer.balance } : null,
      timestamp: transaction.date
    });
  } catch (err) {
    console.error('POS sale error:', err);
    res.status(500).json({ error: 'Satış işlenirken hata oluştu.', details: err.message });
  }
});

// GET /api/pos/sales - Recent sales history
router.get('/sales', auth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const sales = await Transaction.find({ 
      company: req.user.company, 
      type: { $in: ['income', 'receivable'] },
      description: { $regex: /perakende satış/i },
      cancelled: { $ne: true }
    })
    .sort({ date: -1 })
    .limit(limit)
    .populate('customer', 'name')
    .populate('sourceAccount', 'name type')
    .populate('createdBy', 'name username');

    res.json(sales);
  } catch (err) {
    console.error('POS sales history error:', err);
    res.status(500).json({ error: 'Satış geçmişi alınamadı.' });
  }
});

// GET /api/pos/sales/:id - Get sale detail
router.get('/sales/:id', auth, async (req, res) => {
  try {
    const sale = await Transaction.findOne({ 
      _id: req.params.id, 
      company: req.user.company 
    })
    .populate('customer', 'name email phone')
    .populate('sourceAccount', 'name type balance')
    .populate('items.product', 'name sku barcode')
    .populate('createdBy', 'name username')
    .populate('cancelledBy', 'name username');

    if (!sale) {
      return res.status(404).json({ error: 'Satış bulunamadı.' });
    }

    res.json(sale);
  } catch (err) {
    console.error('POS sale detail error:', err);
    res.status(500).json({ error: 'Satış detayı alınamadı.' });
  }
});

// POST /api/pos/sales/:id/cancel - Cancel a sale
router.post('/sales/:id/cancel', auth, async (req, res) => {
  try {
    const sale = await Transaction.findOne({ 
      _id: req.params.id, 
      company: req.user.company,
      cancelled: { $ne: true }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Satış bulunamadı veya zaten iptal edilmiş.' });
    }

    // Reverse stock movements
    for (const item of sale.items || []) {
      const prod = await Product.findOne({ _id: item.product, company: req.user.company });
      if (prod && prod.trackStock) {
        prod.quantity += item.quantity;
        await prod.save();
        
        // Create reverse stock movement
        const sm = new StockMovement({ 
          product: prod._id, 
          type: 'in', 
          quantity: item.quantity, 
          company: req.user.company,
          date: new Date(),
          reason: `Satış iptali: ${sale._id}`
        });
        await sm.save();
      }
    }

    // Reverse account balance if cash sale
    if (sale.targetAccount) {
      const account = await Account.findOne({ _id: sale.targetAccount, company: req.user.company });
      if (account) {
        account.balance -= sale.amount;
        await account.save();
      }
    }

    // Reverse customer balance if credit sale
    if (sale.customer && sale.type === 'receivable') {
      const customer = await Customer.findOne({ _id: sale.customer, company: req.user.company });
      if (customer) {
        customer.balance -= sale.amount;
        await customer.save();
      }
    }

    // Mark as cancelled
    sale.cancelled = true;
    sale.cancelledAt = new Date();
    sale.cancelledBy = req.user.id || req.user._id;
    await sale.save();

    res.json({ 
      success: true, 
      message: 'Satış başarıyla iptal edildi.',
      sale 
    });
  } catch (err) {
    console.error('POS sale cancel error:', err);
    res.status(500).json({ error: 'Satış iptal edilirken hata oluştu.', details: err.message });
  }
});

module.exports = router;
