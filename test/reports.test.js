const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const Account = require('../models/Account');
const app = require('../index');

let adminToken, companyId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stoktakip_test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await User.deleteMany({});
  await Account.deleteMany({});
  await Transaction.deleteMany({});
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Admin',
      email: 'admin@r.com',
      password: 'admin123',
      role: 'admin',
      companyName: 'TestCompanyREP',
      address: 'Test Address',
      phone: '555-5564',
      companyEmail: 'companyREP@company.com',
      taxNumber: '133456',
      currency: 'TRY',
      units: ['adet']
    });
  console.log('REGISTER RESPONSE:', res.statusCode, res.body);
  expect(res.statusCode).toBe(200);
  expect(res.body.token).toBeDefined();
  adminToken = res.body.token;
  companyId = res.body.user?.company || res.body.company || res.body.companyId;
  // Örnek gelir/gider ve ürün ekle
  await request(app)
    .post('/api/transactions')
    .set('x-auth-token', adminToken)
    .send({ type: 'income', description: 'Satış', amount: 200, date: '2025-06-01' });
  await request(app)
    .post('/api/transactions')
    .set('x-auth-token', adminToken)
    .send({ type: 'expense', description: 'Gider', amount: 50, date: '2025-06-02' });
  await request(app)
    .post('/api/products')
    .set('x-auth-token', adminToken)
    .send({ name: 'StokTest', sku: 'STKTEST', quantity: 2, criticalStockLevel: 5 });
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Reports API', () => {
  it('should get income/expense report', async () => {
    const res = await request(app)
      .get('/api/reports/income-expense')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.income).toBeGreaterThanOrEqual(0);
    expect(res.body.expense).toBeGreaterThanOrEqual(0);
  });

  it('should get stock movement report', async () => {
    const res = await request(app)
      .get('/api/reports/stock-movements')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should get cash flow', async () => {
    const res = await request(app)
      .get('/api/reports/cash-flow')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should get debt-credit report', async () => {
    const res = await request(app)
      .get('/api/reports/debt-credit')
      .set('x-auth-token', adminToken);
    expect([200, 204]).toContain(res.statusCode);
    expect(typeof res.body).toBe('object');
  });
});
