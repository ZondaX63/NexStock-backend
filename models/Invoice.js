const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const InvoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        required: true,
        unique: true,
    },
    customerOrSupplier: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'partnerModel',
    },
    partnerModel: {
        type: String,
        required: true,
        enum: ['Customer', 'Supplier'],
    },
    products: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true,
            },
            quantity: {
                type: Number,
                required: true,
            },
            price: {
                type: Number,
                required: true,
            },
            purchasePrice: {
                type: Number,
                default: 0,
            },
            salePrice: {
                type: Number,
                default: 0,
            },
            vat: {
                type: Number,
                default: 0,
            },
            discount1: {
                type: Number,
                default: 0,
            },
            discount2: {
                type: Number,
                default: 0,
            },
            discount3: {
                type: Number,
                default: 0,
            },
            discount4: {
                type: Number,
                default: 0,
            },
        },
    ],
    totalAmount: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        default: 'TRY',
        enum: ['TRY', 'USD', 'EUR', 'GBP'],
    },
    exchangeRate: {
        type: Number,
        default: 1,
    },
    paidAmount: {
        type: Number,
        default: 0,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    type: {
        type: String,
        enum: ['purchase', 'sale'],
        required: true,
    },
    status: {
        type: String,
        enum: ['draft', 'approved', 'rejected', 'paid'],
        default: 'draft',
    },
    dueDate: {
        type: Date,
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
    },
    vat: {
        type: Number,
        default: 0,
    },
    discount1: {
        type: Number,
        default: 0,
    },
    discount2: {
        type: Number,
        default: 0,
    },
    discount3: {
        type: Number,
        default: 0,
    },
    discount4: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

InvoiceSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Invoice', InvoiceSchema);
