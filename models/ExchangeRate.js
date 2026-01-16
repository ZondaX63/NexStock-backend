const mongoose = require('mongoose');

const ExchangeRateSchema = new mongoose.Schema({
    currency: {
        type: String,
        required: true,
        unique: true,
        enum: ['USD', 'EUR', 'GBP']
    },
    rate: {
        type: Number,
        required: true,
        min: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('ExchangeRate', ExchangeRateSchema);
