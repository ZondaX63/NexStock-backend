const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const SupplierSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    contactPerson: {
        type: String,
    },
    email: {
        type: String,
        // required: true, // Made optional
        unique: true,
    },
    phone: {
        type: String,
    },
    address: {
        type: String,
    },
    taxNumber: {
        type: String,
        default: '',
    },
    taxOffice: {
        type: String,
        default: '',
    },
    creditLimit: {
        type: Number,
        default: 0,
    },
    balance: {
        type: Number,
        default: 0, // Positive: We owe them (Payable), Negative: They owe us (Receivable) - Wait, standard convention?
        // Let's stick to: 
        // Customer: Positive = Receivable (Asset)
        // Supplier: Positive = Payable (Liability)
        // Actually, to keep it simple:
        // Customer Balance > 0 means they owe us.
        // Supplier Balance > 0 means we owe them.
    },
    notes: {
        type: String,
        default: '',
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
    },
}, { timestamps: true });

SupplierSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Supplier', SupplierSchema);
