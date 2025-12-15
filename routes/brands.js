const express = require('express');
const router = express.Router();
const Brand = require('../models/Brand');
const { auth } = require('../middleware/authMiddleware');

// Şirket bazlı tüm markaları getir
router.get('/', auth, async (req, res) => {
  try {
    const brands = await Brand.find({ company: req.user.company });
    res.json(brands);
  } catch (err) {
    res.status(500).json({ error: 'Marka listelenemedi.' });
  }
});

// Yeni marka ekle
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const brand = new Brand({
      name,
      description,
      company: req.user.company
    });
    await brand.save();
    res.status(201).json(brand);
  } catch (err) {
    res.status(400).json({ error: 'Marka eklenemedi.' });
  }
});

// Marka güncelle
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const brand = await Brand.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { name, description },
      { new: true }
    );
    if (!brand) return res.status(404).json({ error: 'Marka bulunamadı.' });
    res.json(brand);
  } catch (err) {
    res.status(400).json({ error: 'Marka güncellenemedi.' });
  }
});

// Marka sil
router.delete('/:id', auth, async (req, res) => {
  try {
    const brand = await Brand.findOneAndDelete({ _id: req.params.id, company: req.user.company });
    if (!brand) return res.status(404).json({ error: 'Marka bulunamadı.' });
    res.json({ message: 'Marka silindi.' });
  } catch (err) {
    res.status(400).json({ error: 'Marka silinemedi.' });
  }
});

module.exports = router; 