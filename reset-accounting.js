const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

const Account = require('./models/Account');
const Customer = require('./models/Customer');
const Supplier = require('./models/Supplier');
const Invoice = require('./models/Invoice');
const Transaction = require('./models/Transaction');
const StockMovement = require('./models/StockMovement');

const resetAccounting = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');

        console.log('Deleting Invoices...');
        await Invoice.deleteMany({});

        console.log('Deleting Transactions...');
        await Transaction.deleteMany({});

        console.log('Deleting Stock Movements (related to invoices)...');
        // Only delete movements related to invoices, keep manual adjustments if any? 
        // For a full reset, let's wipe all stock movements to be safe or just invoice ones.
        // The user said "accounting system", but stock is tied to invoices. 
        // Let's wipe invoice-related stock movements.
        await StockMovement.deleteMany({ invoice: { $exists: true } });

        console.log('Resetting Account Balances...');
        await Account.updateMany({}, { $set: { balance: 0 } });

        console.log('Resetting Customer Balances...');
        // Add balance field if not exists, set to 0
        await Customer.updateMany({}, { $set: { balance: 0 } });

        console.log('Resetting Supplier Balances...');
        // Add balance field if not exists, set to 0
        await Supplier.updateMany({}, { $set: { balance: 0 } });

        console.log('Accounting System Reset Complete!');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

resetAccounting();
