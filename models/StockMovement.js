const mongoose = require('mongoose');

const StockMovementSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    type: { type: String, enum: ['in', 'out'], required: true }, // 'in' for purchase, 'out' for sale
    quantity: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
});

module.exports = mongoose.model('StockMovement', StockMovementSchema); 