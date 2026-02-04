const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const CustomerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
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
        default: 0, // Positive: They owe us, Negative: We owe them
    },
    currency: {
        type: String,
        default: 'TRY',
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

CustomerSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Customer', CustomerSchema);
