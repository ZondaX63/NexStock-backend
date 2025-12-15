const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const ProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    sku: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
        default: '',
    },
    barcode: {
        type: String,
        default: '',
    },
    oem: {
        type: String,
        default: '',
        index: true, // OEM aramaları için indeks
    },
    manufacturerCode: {
        type: String,
        default: '',
        index: true, // Üretici kodu aramaları için indeks
    },
    manufacturer: {
        type: String,
        default: '', // BMW, FEBI, 4U gibi
    },
    tags: {
        type: [String],
        default: [],
    },
    unit: {
        type: String,
        required: true,
        default: 'Adet',
    },
    purchasePrice: {
        type: Number,
        default: 0,
        min: 0,
    },
    salePrice: {
        type: Number,
        default: 0,
        min: 0,
    },
    currency: {
        type: String,
        default: 'TRY',
        enum: ['TRY', 'USD', 'EUR', 'GBP'],
    },
    priceUSD: {
        type: Number,
        default: 0,
    },
    priceEUR: {
        type: Number,
        default: 0,
    },
    quantity: {
        type: Number,
        default: 0,
        min: 0,
    },
    criticalStockLevel: {
        type: Number,
        default: 10,
    },
    trackStock: {
        type: Boolean,
        default: true,
    },
    shelfLocation: {
        type: String,
        default: '',
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: false,
    },
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        required: false,
    },
}, { timestamps: true });

// Ensure SKU is unique per company
ProductSchema.index({ sku: 1, company: 1 }, { unique: true });
ProductSchema.index({ category: 1 });
ProductSchema.index({ brand: 1 });
ProductSchema.index({ trackStock: 1 });
// OEM ve üretici kodu aramaları için indeksler
ProductSchema.index({ oem: 1, company: 1 });
ProductSchema.index({ manufacturerCode: 1, company: 1 });
ProductSchema.index({ manufacturer: 1, company: 1 });
// Text search için compound indeks
ProductSchema.index({ name: 'text', sku: 'text', oem: 'text', manufacturerCode: 'text' });

ProductSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Product', ProductSchema);
