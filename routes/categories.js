const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { auth } = require('../middleware/authMiddleware');

// Şirket bazlı tüm kategorileri getir
router.get('/', auth, async (req, res) => {
  try {
    const categories = await Category.find({ company: req.user.company });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Kategori listelenemedi.' });
  }
});

// Yeni kategori ekle
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = new Category({
      name,
      description,
      company: req.user.company
    });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: 'Kategori eklenemedi.' });
  }
});

// Kategori güncelle
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { name, description },
      { new: true }
    );
    if (!category) return res.status(404).json({ error: 'Kategori bulunamadı.' });
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: 'Kategori güncellenemedi.' });
  }
});

// Kategori sil
router.delete('/:id', auth, async (req, res) => {
  try {
    const category = await Category.findOneAndDelete({ _id: req.params.id, company: req.user.company });
    if (!category) return res.status(404).json({ error: 'Kategori bulunamadı.' });
    res.json({ message: 'Kategori silindi.' });
  } catch (err) {
    res.status(400).json({ error: 'Kategori silinemedi.' });
  }
});

module.exports = router; 