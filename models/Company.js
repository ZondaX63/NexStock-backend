const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  taxNumber: { type: String, default: '' },
  // İleride logo, vs. eklenebilir
}, { timestamps: true });

module.exports = mongoose.model('Company', CompanySchema); 