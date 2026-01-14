const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const Product = require('../models/Product');
const User = require('../models/User');

let adminToken;

describe('Excel Services API', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/excel_test');
        await User.deleteMany({});
        await Product.deleteMany({});

        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Excel Admin',
                email: 'excel@admin.com',
                password: 'password123',
                companyName: 'ExcelCorp'
            });
        adminToken = res.body.token;

        await request(app)
            .post('/api/products')
            .set('x-auth-token', adminToken)
            .send({ name: 'Excel Product 1', sku: 'EX-001', quantity: 10, unit: 'Adet' });
    });

    afterAll(async () => {
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    });

    it('should export products to Excel', async () => {
        const res = await request(app)
            .get('/api/products/export')
            .set('x-auth-token', adminToken);
        
        expect(res.statusCode).toBe(200);
        expect(res.header['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(res.body instanceof Buffer).toBe(true);
    });

    // Mocking file upload is tricky with supertest but possible
    it('should fail import with no file', async () => {
        const res = await request(app)
            .post('/api/products/import')
            .set('x-auth-token', adminToken);
        expect(res.statusCode).toBe(400);
    });
});
