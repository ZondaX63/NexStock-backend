const mongoose = require('mongoose');
const LogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: String, // örn: 'create', 'update', 'delete', 'transfer'
  module: String, // örn: 'product', 'customer', 'account'
  targetId: String, // ilgili kaydın id'si
  targetName: String, // örn: ürün adı
  message: String, // örn: 'İzzet, Ürün 12 stok artırdı'
  date: { type: Date, default: Date.now },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
});
module.exports = mongoose.model('Log', LogSchema); 