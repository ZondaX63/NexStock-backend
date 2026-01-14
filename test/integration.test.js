const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Company = require('../models/Company');
const Invoice = require('../models/Invoice');

let token, companyId, productId, customerId;

describe('E2E Integration Flow', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/integration_test');
        await User.deleteMany({});
        await Company.deleteMany({});
        await Product.deleteMany({});
        await Customer.deleteMany({});
        await Invoice.deleteMany({});
    });

    afterAll(async () => {
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    });

    it('Step 1: Register Company and Admin', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Int Admin',
                email: 'int@admin.com',
                password: 'password123',
                companyName: 'IntegrationCorp'
            });
        expect(res.statusCode).toBe(200);
        token = res.body.token;
        companyId = res.body.companyId || res.body.user.company;
        expect(token).toBeDefined();
        expect(companyId).toBeDefined();
    });

    it('Step 2: Add a Product', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('x-auth-token', token)
            .send({
                name: 'Integration Product',
                sku: 'IP-001',
                quantity: 100,
                salePrice: 50,
                purchasePrice: 30,
                criticalStockLevel: 5
            });
        expect(res.statusCode).toBe(200);
        productId = res.body._id;
        expect(productId).toBeDefined();
    });

    it('Step 3: Add a Customer', async () => {
        const res = await request(app)
            .post('/api/customers')
            .set('x-auth-token', token)
            .send({
                name: 'Int Customer',
                email: 'int@customer.com',
                phone: '1234567890'
            });
        expect(res.statusCode).toBe(200);
        customerId = res.body._id;
        expect(customerId).toBeDefined();
    });

    it('Step 4: Create a Sale Invoice (Stock Reduction)', async () => {
        // Create a draft invoice
        const res = await request(app)
            .post('/api/invoices')
            .set('x-auth-token', token)
            .send({
                invoiceNumber: 'INV-INT-01',
                customerOrSupplier: customerId,
                partnerModel: 'Customer',
                type: 'sale',
                products: [{
                    product: productId,
                    quantity: 10,
                    price: 60
                }]
            });
        expect(res.statusCode).toBe(200);
        const invoiceId = res.body._id;

        // Approve the invoice (which should reduce stock)
        const approveRes = await request(app)
            .post(`/api/invoices/${invoiceId}/approve`)
            .set('x-auth-token', token)
            .send({});
        
        expect(approveRes.statusCode).toBe(200);
    });

    it('Step 5: Verify Product Stock Reduced', async () => {
        const res = await request(app)
            .get(`/api/products/${productId}`)
            .set('x-auth-token', token);
        expect(res.statusCode).toBe(200);
        // Initial was 100, sold 10, should be 90
        expect(res.body.product.quantity).toBe(90);
    });
});
