const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['income', 'expense', 'transfer', 'invoice_accrual'],
        required: true,
    },
    description: {
        type: String,
    },
    amount: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    relatedInvoice: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
    },
    sourceAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
    },
    targetAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
});

module.exports = mongoose.model('Transaction', TransactionSchema);
