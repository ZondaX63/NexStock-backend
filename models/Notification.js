const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    type: { type: String, required: true },
    message: { type: String, required: true },
    relatedId: { type: mongoose.Schema.Types.ObjectId },
    read: { type: Boolean, default: false },
    date: { type: Date, default: Date.now },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema); 