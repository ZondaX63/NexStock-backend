const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { auth } = require('../middleware/authMiddleware');

// Bildirimleri listele (şirket bazlı)
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ company: req.user.company }).sort({ date: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Bildirimler alınamadı.' });
  }
});

// Yeni bildirim ekle
router.post('/', auth, async (req, res) => {
  try {
    const { type, message, relatedId } = req.body;
    const notification = new Notification({
      type,
      message,
      relatedId,
      company: req.user.company
    });
    await notification.save();
    res.status(201).json(notification);
  } catch (err) {
    res.status(400).json({ error: 'Bildirim eklenemedi.' });
  }
});

// Bildirimi okundu olarak işaretle
router.put('/:id', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'Bildirim bulunamadı.' });
    res.json(notification);
  } catch (err) {
    res.status(400).json({ error: 'Bildirim güncellenemedi.' });
  }
});

// Tüm bildirimleri sil
router.delete('/delete-all', auth, async (req, res) => {
  try {
    await Notification.deleteMany({ company: req.user.company });
    res.json({ message: 'Tüm bildirimler silindi.' });
  } catch (err) {
    console.error("Delete all notifications error:", err);
    res.status(500).json({ error: 'Bildirimler silinemedi.' });
  }
});

// Bildirim sil (tekil)
router.delete('/:id', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, company: req.user.company });
    if (!notification) return res.status(404).json({ error: 'Bildirim bulunamadı.' });
    res.json({ message: 'Bildirim silindi.' });
  } catch (err) {
    res.status(400).json({ error: 'Bildirim silinemedi.' });
  }
});

// Tüm bildirimleri okundu yap - Metod POST olarak değiştirildi
router.post('/mark-all-read', auth, async (req, res) => {
  try {
    await Notification.updateMany({ company: req.user.company, read: false }, { $set: { read: true } });
    res.json({ message: 'Tüm bildirimler okundu olarak işaretlendi.' });
  } catch (err) {
    console.error("Mark all read error:", err);
    res.status(500).json({ error: 'Bildirimler güncellenemedi.' });
  }
});

module.exports = router;
