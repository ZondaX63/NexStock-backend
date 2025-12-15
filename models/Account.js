const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['cash', 'bank', 'credit_card', 'personnel', 'cari'], required: true },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'TRY' },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    cariType: { type: String, enum: ['customer', 'supplier', null], default: null },
    partnerId: { type: mongoose.Schema.Types.ObjectId, refPath: 'cariType', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Account', AccountSchema); 