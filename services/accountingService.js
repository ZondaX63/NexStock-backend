const mongoose = require('mongoose');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');

/**
 * Recomputes the balance for a specific account based on transactions.
 * @param {Object} account - The account document.
 */
async function recomputeAccountBalance(account) {
    const accountId = account._id;
    const companyId = account.company;

    // Find all transactions involving this account
    const transactions = await Transaction.find({
        company: companyId,
        $or: [
            { sourceAccount: accountId },
            { targetAccount: accountId }
        ]
    });

    let balance = 0;

    for (const tx of transactions) {
        const amount = tx.amount || 0;

        if (tx.type === 'income') {
            // Income increases the target account
            if (tx.targetAccount && tx.targetAccount.toString() === accountId.toString()) {
                balance += amount;
            }
        } else if (tx.type === 'expense') {
            // Expense decreases the source account
            if (tx.sourceAccount && tx.sourceAccount.toString() === accountId.toString()) {
                balance -= amount;
            }
        } else if (tx.type === 'transfer') {
            // Transfer decreases source, increases target
            if (tx.sourceAccount && tx.sourceAccount.toString() === accountId.toString()) {
                balance -= amount;
            }
            if (tx.targetAccount && tx.targetAccount.toString() === accountId.toString()) {
                balance += amount;
            }
        }
    }

    account.balance = balance;
    await account.save();
    return balance;
}

/**
 * Recomputes balances for all customers and suppliers of a company.
 * @param {string} companyId 
 */
async function recomputePartnerBalances(companyId) {
    // 1. Customers
    const customers = await Customer.find({ company: companyId });
    for (const customer of customers) {
        // Total Sales (Invoices)
        const salesResult = await Invoice.aggregate([
            { 
                $match: { 
                    company: new mongoose.Types.ObjectId(companyId), 
                    customerOrSupplier: customer._id, 
                    type: 'sale',
                    status: { $ne: 'rejected' } // Don't count rejected invoices
                } 
            },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const totalSales = salesResult[0]?.total || 0;

        // Total Payments Received (Income Transactions)
        const paymentsResult = await Transaction.aggregate([
            { 
                $match: { 
                    company: new mongoose.Types.ObjectId(companyId), 
                    customer: customer._id, 
                    type: 'income' 
                } 
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalPayments = paymentsResult[0]?.total || 0;

        // Balance = Sales - Payments
        // Positive Balance = Customer owes us
        customer.balance = totalSales - totalPayments;
        await customer.save();
    }

    // 2. Suppliers
    const suppliers = await Supplier.find({ company: companyId });
    for (const supplier of suppliers) {
        // Total Purchases (Invoices)
        const purchasesResult = await Invoice.aggregate([
            { 
                $match: { 
                    company: new mongoose.Types.ObjectId(companyId), 
                    customerOrSupplier: supplier._id, 
                    type: 'purchase',
                    status: { $ne: 'rejected' }
                } 
            },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const totalPurchases = purchasesResult[0]?.total || 0;

        // Total Payments Made (Expense Transactions)
        const paymentsResult = await Transaction.aggregate([
            { 
                $match: { 
                    company: new mongoose.Types.ObjectId(companyId), 
                    supplier: supplier._id, 
                    type: 'expense' 
                } 
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalPayments = paymentsResult[0]?.total || 0;

        // Balance = Purchases - Payments
        // Positive Balance = We owe supplier
        supplier.balance = totalPurchases - totalPayments;
        await supplier.save();
    }
}

module.exports = {
    recomputeAccountBalance,
    recomputePartnerBalances
};
