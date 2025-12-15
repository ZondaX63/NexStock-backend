const request = require('supertest');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const app = require('../server');
const Account = require('../models/Account');

let adminToken, companyId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stoktakip_test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await User.deleteMany({});
  await Account.deleteMany({});
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Admin',
      email: 'admin@tr.com',
      password: 'admin123',
      role: 'admin',
      companyName: 'TestCompanyTR',
      address: 'Test Address',
      phone: '555-5559',
      companyEmail: 'companyTR@company.com',
      taxNumber: '523456',
      currency: 'TRY',
      units: ['adet']
    });
  console.log('REGISTER RESPONSE:', res.statusCode, res.body);
  expect(res.statusCode).toBe(200);
  expect(res.body.token).toBeDefined();
  adminToken = res.body.token;
  companyId = res.body.user?.company || res.body.company || res.body.companyId;
  expect(adminToken).toBeDefined();
  expect(companyId).toBeDefined();
  const accRes = await request(app)
    .post('/api/accounts')
    .set('x-auth-token', adminToken)
    .send({ name: 'Kasa', type: 'cash', balance: 1000, company: companyId });
  console.log('ACCOUNT CREATE RESPONSE:', accRes.statusCode, accRes.body);
  expect([200, 201]).toContain(accRes.statusCode);
  const accountId = accRes.body.account._id;
  expect(accountId).toBeDefined();
  accountA = accRes.body.account;
  accountB = await Account.create({ name: 'Banka', type: 'bank', balance: 500, currency: 'TRY', company: companyId });
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Transaction API', () => {
  let transactionId;
  it('should create an income transaction', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('x-auth-token', adminToken)
      .send({ type: 'income', description: 'Satış', amount: 100 });
    expect(res.statusCode).toBe(200);
    expect(res.body.type).toBe('income');
    transactionId = res.body._id;
  });

  it('should create an expense transaction', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('x-auth-token', adminToken)
      .send({ type: 'expense', description: 'Gider', amount: 50 });
    expect(res.statusCode).toBe(200);
    expect(res.body.type).toBe('expense');
  });

  it('should get all transactions', async () => {
    const res = await request(app)
      .get('/api/transactions')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should not allow unauthenticated access', async () => {
    const res = await request(app).get('/api/transactions');
    expect(res.statusCode).toBe(401);
  });

  it('should get transaction flow (auth)', async () => {
    const res = await request(app)
      .get('/api/transactions/flow')
      .set('x-auth-token', adminToken);
    expect([200, 204]).toContain(res.statusCode);
    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });
});

describe('Account Transfer API', () => {
  let adminToken, accountA, accountB;
  beforeAll(async () => {
    await Account.deleteMany({});
    const userRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Admin', email: 'admin@transfer.com', password: 'admin123', role: 'admin', companyName: 'TestCompanyTRANSFER', address: 'Test Address', phone: '555-5552', companyEmail: 'companyTRANSFER@company.com', taxNumber: '723456', currency: 'TRY', units: ['adet'] });
    adminToken = userRes.body.token;
    companyId = userRes.body.user?.company || userRes.body.company || userRes.body.companyId;
    expect(adminToken).toBeDefined();
    expect(companyId).toBeDefined();
    accountA = await Account.create({ name: 'Kasa', type: 'cash', balance: 1000, currency: 'TRY', company: companyId });
    accountB = await Account.create({ name: 'Banka', type: 'bank', balance: 500, currency: 'TRY', company: companyId });
  });

  it('should transfer between accounts', async () => {
    const res = await request(app)
      .post('/api/accounts/transfer')
      .set('x-auth-token', adminToken)
      .send({ sourceAccountId: accountA._id, targetAccountId: accountB._id, amount: 200, description: 'Test transfer' });
    expect(res.statusCode).toBe(201);
    expect(res.body.transaction).toBeDefined();
    const updatedA = await Account.findById(accountA._id);
    const updatedB = await Account.findById(accountB._id);
    expect(updatedA.balance).toBe(800);
    expect(updatedB.balance).toBe(700);
  });

  it('should not allow transfer with insufficient balance', async () => {
    const res = await request(app)
      .post('/api/accounts/transfer')
      .set('x-auth-token', adminToken)
      .send({ sourceAccountId: accountA._id, targetAccountId: accountB._id, amount: 10000, description: 'Too much' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Yetersiz bakiye/);
  });

  it('should not allow transfer to same account', async () => {
    const res = await request(app)
      .post('/api/accounts/transfer')
      .set('x-auth-token', adminToken)
      .send({ sourceAccountId: accountA._id, targetAccountId: accountA._id, amount: 100, description: 'Same account' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/aynı olamaz/);
  });
});
