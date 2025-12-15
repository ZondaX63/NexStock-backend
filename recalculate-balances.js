require('dotenv').config();
const mongoose = require('mongoose');
const Account = require('./models/Account');
const Company = require('./models/Company');
const { recomputeAccountBalance, recomputePartnerBalances } = require('./services/accountingService');

async function main() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/stok-takip';
    console.log('Connecting to MongoDB:', mongoUri);
    
    await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    console.log('Connected.');

    const companies = await Company.find({});
    console.log(`Found ${companies.length} companies.`);

    for (const comp of companies) {
        console.log(`Processing Company: ${comp.name} (${comp._id})`);

        // 1. Recompute Accounts
        const accounts = await Account.find({ company: comp._id });
        console.log(`  Found ${accounts.length} accounts.`);
        for (const acc of accounts) {
            const newBalance = await recomputeAccountBalance(acc);
            console.log(`    Account '${acc.name}': New Balance = ${newBalance}`);
        }

        // 2. Recompute Partners (Customers/Suppliers)
        console.log(`  Recomputing Partner Balances...`);
        await recomputePartnerBalances(comp._id);
        console.log(`  Partner Balances Updated.`);
    }

    console.log('All done.');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
