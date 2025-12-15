const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
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
    expectedDeliveryDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['draft', 'sent', 'confirmed', 'shipped', 'received', 'cancelled', 'completed'],
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

module.exports = mongoose.model('Order', OrderSchema);
