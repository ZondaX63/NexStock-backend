const mongoose = require('mongoose');

const OfferSchema = new mongoose.Schema({
    offerNumber: {
        type: String,
        required: true,
        unique: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    products: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        unitPrice: {
            type: Number,
            required: true
        },
        taxRate: {
            type: Number,
            default: 18
        },
        discount: {
            type: Number,
            default: 0
        }
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        enum: ['TRY', 'USD', 'EUR', 'GBP'],
        default: 'TRY'
    },
    exchangeRate: {
        type: Number,
        default: 1
    },
    date: {
        type: Date,
        default: Date.now
    },
    validUntil: {
        type: Date
    },
    status: {
        type: String,
        enum: ['draft', 'sent', 'accepted', 'rejected', 'converted'],
        default: 'draft'
    },
    description: {
        type: String
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Offer', OfferSchema);
