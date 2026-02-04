const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/authMiddleware');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const { recomputeAccountBalance } = require('../services/accountingService');

// Şirket bazlı tüm hesapları getir
router.get('/', auth, async (req, res) => {
  try {
    const accounts = await Account.find({ company: req.user.company });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Hesaplar listelenemedi.' });
  }
});

// Yeni hesap ekle
router.post('/', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { 
        name, type, balance, currency, cariType, email, phone, address,
        bankName, iban, branchCode, accountNumber,
        creditLimit, cutoffDay, paymentDay
    } = req.body;
    
    let partnerId = null;
    let cari = null;
    if (type === 'cari') {
      if (!cariType || !email) {
        throw new Error('Cari hesap için cariType ve email zorunludur.');
      }
      if (cariType === 'customer') {
        cari = await Customer.findOne({ email, company: req.user.company }).session(session);
        if (!cari) {
          cari = new Customer({ name, email, phone, address, company: req.user.company });
          await cari.save({ session });
        }
      } else if (cariType === 'supplier') {
        cari = await Supplier.findOne({ email, company: req.user.company }).session(session);
        if (!cari) {
          cari = new Supplier({ name, email, phone, address, company: req.user.company });
          await cari.save({ session });
        }
      }
      partnerId = cari._id;
    }
    
    const account = new Account({
      name,
      type,
      balance: 0,
      currency: currency || 'TRY',
      company: req.user.company,
      cariType: type === 'cari' ? cariType : null,
      partnerId: type === 'cari' ? partnerId : null,
      bankName: type === 'bank' ? bankName : undefined,
      iban: type === 'bank' ? iban : undefined,
      branchCode: type === 'bank' ? branchCode : undefined,
      accountNumber: type === 'bank' ? accountNumber : undefined,
      creditLimit: type === 'credit_card' ? creditLimit : undefined,
      cutoffDay: type === 'credit_card' ? cutoffDay : undefined,
      paymentDay: type === 'credit_card' ? paymentDay : undefined
    });
    await account.save({ session });

    // If initial balance is provided, create a transaction
    if (balance && Number(balance) !== 0) {
        const tx = new Transaction({
            type: Number(balance) > 0 ? 'income' : 'expense',
            amount: Math.abs(Number(balance)),
            description: 'Açılış Bakiyesi',
            date: new Date(),
            targetAccount: Number(balance) > 0 ? account._id : undefined,
            sourceAccount: Number(balance) > 0 ? undefined : account._id,
            company: req.user.company,
            createdBy: req.user.id
        });
        await tx.save({ session });
        
        // Update account balance manually here since we are in a transaction and service might not see it yet
        account.balance = Number(balance);
        await account.save({ session });
    }

    await session.commitTransaction();
    res.status(201).json({ account, cari });
  } catch (err) {
    await session.abortTransaction();
    console.error(err);
    res.status(400).json({ error: err.message || 'Hesap eklenemedi.' });
  } finally {
    session.endSession();
  }
});

// Hesap güncelle
router.put('/:id', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { name, type, currency, cariType, partnerId, balance } = req.body;
    
    // Get current account to compare balance
    const currentAccount = await Account.findOne({ _id: req.params.id, company: req.user.company }).session(session);
    if (!currentAccount) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Hesap bulunamadı.' });
    }

    const oldBalance = currentAccount.balance || 0;
    const newBalance = balance !== undefined ? Number(balance) : oldBalance;
    const balanceChanged = Math.abs(newBalance - oldBalance) > 0.001; // Floating point comparison

    // Update account fields
    currentAccount.name = name || currentAccount.name;
    currentAccount.type = type || currentAccount.type;
    currentAccount.currency = currency || currentAccount.currency;
    currentAccount.cariType = cariType || currentAccount.cariType;
    currentAccount.partnerId = partnerId || currentAccount.partnerId;
    currentAccount.balance = newBalance;

    await currentAccount.save({ session });

    // If balance changed, create a transaction record
    if (balanceChanged) {
      const difference = newBalance - oldBalance;
      const transaction = new Transaction({
        type: difference > 0 ? 'income' : 'expense',
        amount: Math.abs(difference),
        currency: currentAccount.currency,
        description: `Manuel bakiye düzeltmesi: ${currentAccount.name} hesabı ${oldBalance.toFixed(2)} ${currentAccount.currency} → ${newBalance.toFixed(2)} ${currentAccount.currency} (Fark: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} ${currentAccount.currency})`,
        date: new Date(),
        targetAccount: difference > 0 ? currentAccount._id : undefined,
        sourceAccount: difference > 0 ? undefined : currentAccount._id,
        company: req.user.company,
        createdBy: req.user.id
      });
      await transaction.save({ session });
    }

    await session.commitTransaction();
    res.json(currentAccount);
  } catch (err) {
    await session.abortTransaction();
    console.error('Account update error:', err);
    res.status(400).json({ error: 'Hesap güncellenemedi.' });
  } finally {
    session.endSession();
  }
});

// Hesap sil
router.delete('/:id', auth, async (req, res) => {
  try {
    // ObjectId validasyonu
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Geçersiz hesap ID.' });
    }

    const account = await Account.findOneAndDelete({ _id: req.params.id, company: req.user.company });
    if (!account) return res.status(404).json({ error: 'Hesap bulunamadı.' });
    
    // Eğer partnerId varsa ilgili partneri de sil
    if (account.type === 'cari' && account.partnerId && account.cariType) {
      if (account.cariType === 'customer') {
        await Customer.findOneAndDelete({ _id: account.partnerId, company: req.user.company });
      } else if (account.cariType === 'supplier') {
        await Supplier.findOneAndDelete({ _id: account.partnerId, company: req.user.company });
      }
    }
    res.json({ message: 'Hesap silindi.', deletedAccount: account });
  } catch (err) {
    console.error('Account delete error:', err);
    res.status(400).json({ error: 'Hesap silinemedi.' });
  }
});

// Hesaplar arası transfer
router.post('/transfer', auth, async (req, res) => {
  try {
    const { sourceAccountId, targetAccountId, amount, description, date } = req.body;
    if (!sourceAccountId || !targetAccountId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Geçersiz transfer bilgisi.' });
    }
    if (sourceAccountId === targetAccountId) {
      return res.status(400).json({ error: 'Kaynak ve hedef hesap aynı olamaz.' });
    }
    // Hesapları bul ve şirket kontrolü yap
    const [source, target] = await Promise.all([
      Account.findOne({ _id: sourceAccountId, company: req.user.company }),
      Account.findOne({ _id: targetAccountId, company: req.user.company })
    ]);
    if (!source || !target) {
      return res.status(404).json({ error: 'Hesap(lar) bulunamadı.' });
    }
    if (source.balance < amount) {
      return res.status(400).json({ error: 'Yetersiz bakiye.' });
    }
    // Bakiye güncelle
    source.balance -= amount;
    target.balance += amount;
    await Promise.all([source.save(), target.save()]);
    // Transaction kaydı
    const Transaction = require('../models/Transaction');
    const transaction = new Transaction({
      type: 'transfer',
      description: description || '',
      amount,
      date: date || new Date(),
      company: req.user.company,
      sourceAccount: source._id,
      targetAccount: target._id,
      createdBy: req.user.id
    });
    await transaction.save();
    res.status(201).json({ message: 'Transfer başarılı', transaction });
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ error: 'Transfer işlemi başarısız.' });
  }
});

// @route   POST api/accounts/:id/adjust-balance
// @desc    Manually adjust account balance with confirmation
// @access  Private
router.post('/:id/adjust-balance', auth, async (req, res) => {
  try {
    const { newBalance, reason, confirmation } = req.body;

    if (!confirmation) {
      return res.status(400).json({ error: 'Onay gerekli. İşlemi onaylamak için confirmation: true gönderin.' });
    }

    const account = await Account.findOne({ _id: req.params.id, company: req.user.company });
    if (!account) {
      return res.status(404).json({ error: 'Hesap bulunamadı.' });
    }

    const oldBalance = account.balance;
    const difference = newBalance - oldBalance;

    if (difference === 0) {
      return res.status(400).json({ error: 'Yeni bakiye mevcut bakiye ile aynı.' });
    }

    // Create adjustment transaction
    const transaction = new Transaction({
      type: difference > 0 ? 'income' : 'expense',
      description: `Manuel bakiye düzeltmesi: ${reason || 'Sebep belirtilmedi'} (Eski: ${oldBalance.toFixed(2)} ${account.currency}, Yeni: ${newBalance.toFixed(2)} ${account.currency})`,
      amount: Math.abs(difference),
      date: new Date(),
      sourceAccount: difference < 0 ? account._id : undefined,
      targetAccount: difference > 0 ? account._id : undefined,
      company: req.user.company,
      createdBy: req.user.id
    });
    await transaction.save();

    // Update account balance
    account.balance = newBalance;
    await account.save();

    res.json({ 
      success: true, 
      message: 'Hesap bakiyesi başarıyla güncellendi.',
      oldBalance,
      newBalance,
      difference,
      transaction 
    });
  } catch (err) {
    console.error('Adjust account balance error:', err);
    res.status(500).json({ error: 'Bakiye düzeltilirken hata oluştu.', details: err.message });
  }
});

module.exports = router; 