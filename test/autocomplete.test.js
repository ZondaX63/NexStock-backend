const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const app = require('../index');

let adminToken, companyId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stoktakip_test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await User.deleteMany({});
  await Product.deleteMany({});
  await Customer.deleteMany({});
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Admin',
      email: 'admin@auto.com',
      password: 'admin123',
      role: 'admin',
      companyName: 'TestCompanyAUTO',
      address: 'Test Address',
      phone: '555-5560',
      companyEmail: 'companyAUTO@company.com',
      taxNumber: '623456',
      currency: 'TRY',
      units: ['adet']
    });
  console.log('REGISTER RESPONSE:', res.statusCode, res.body);
  expect(res.statusCode).toBe(200);
  expect(res.body.token).toBeDefined();
  adminToken = res.body.token;
  companyId = res.body.user?.company || res.body.company || res.body.companyId;
  await request(app)
    .post('/api/products')
    .set('x-auth-token', adminToken)
    .send({ name: 'AutoKalem', sku: 'AUTO1', quantity: 10, criticalStockLevel: 2 });
  await request(app)
    .post('/api/customers')
    .set('x-auth-token', adminToken)
    .send({ name: 'AutoMüşteri', email: 'auto@a.com', phone: '5550001111', address: 'Adres' });
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Autocomplete API', () => {
  it('should autocomplete products', async () => {
    const res = await request(app)
      .get('/api/autocomplete/products?q=kalem')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should autocomplete customers', async () => {
    const res = await request(app)
      .get('/api/autocomplete/customers?q=auto')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
