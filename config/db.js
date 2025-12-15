const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    // Check if we have a connection to the database or if it's currently connecting or disconnecting (readyState 1 or 2)
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    const fallbackCluster = 'mongodb://mongo:27017/stok_takip';
    const fallbackLocal = 'mongodb://127.0.0.1:27017/stok_takip';
    const fallback = fallbackLocal;
    const uri = process.env.MONGO_URI || fallback;

    if (!uri || typeof uri !== 'string') {
        console.error('MONGO_URI tanımlı değil. Container env içinde MONGO_URI ayarlayın. Örnek: mongodb://mongo:27017/stok_takip');
        throw new Error('MONGO_URI is not defined');
    }

    const isValidURI = (uri) => /^mongodb(?:\+srv)?:\/\/.+/.test(uri);
    if (!isValidURI(uri)) {
        console.error('Invalid MONGO_URI format. Please check your environment configuration.');
        throw new Error('Invalid MONGO_URI format');
    }

    try {
        await mongoose.connect(uri); // modern driver varsayılanları yeterli
        console.log('MongoDB connected:', uri.replace(/:\/\/([^@]+)@/, '://***@'));
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        throw err;
    }
};

mongoose.connection.on('connected', () => {
    console.log('MongoDB reconnected.');
});
mongoose.connection.on('disconnected', () => {
    console.error('MongoDB disconnected. Attempting to reconnect...');
});

module.exports = connectDB;
