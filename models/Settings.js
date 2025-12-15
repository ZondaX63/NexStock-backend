const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        unique: true,
    },
    theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light'
    },
    currency: {
        type: String,
        default: 'TRY'
    },
    units: {
        type: [String],
        default: ['Adet', 'Kg', 'Litre', 'Metre', 'Koli']
    },
    documentTypes: {
        type: [String],
        default: ['Fatura', 'İrsaliye', 'Teklif', 'Sipariş']
    }
}, { timestamps: true });

module.exports = mongoose.model('Settings', SettingsSchema);
