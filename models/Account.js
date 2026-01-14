const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['cash', 'bank', 'credit_card', 'personnel', 'cari'], required: true },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'TRY' },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    cariType: { type: String, enum: ['customer', 'supplier', null], default: null },
    partnerId: { type: mongoose.Schema.Types.ObjectId, refPath: 'cariType', default: null },
    // Bank specific fields
    bankName: { type: String },
    iban: { type: String },
    branchCode: { type: String },
    accountNumber: { type: String },
    // Credit Card specific fields
    creditLimit: { type: Number },
    cutoffDay: { type: Number }, // Hesap kesim günü (1-31)
    paymentDay: { type: Number }, // Son ödeme günü (1-31)
}, { timestamps: true });

module.exports = mongoose.model('Account', AccountSchema); 