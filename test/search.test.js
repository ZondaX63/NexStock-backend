const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const app = require('../index');

let adminToken, companyId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stoktakip_test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await User.deleteMany({});
  await Product.deleteMany({});
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Admin',
      email: 'admin@search.com',
      password: 'admin123',
      role: 'admin',
      companyName: 'TestCompanySEARCH',
      address: 'Test Address',
      phone: '555-5561',
      companyEmail: 'companySEARCH@company.com',
      taxNumber: '723456',
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
    .send({ name: 'AramaKalem', sku: 'ARAMA1', quantity: 10, criticalStockLevel: 2 });
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Search API', () => {
  it('should search products by name', async () => {
    const res = await request(app)
      .get('/api/search/products?q=kalem')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('AramaKalem');
  });

  it('should filter products by stock', async () => {
    const res = await request(app)
      .get('/api/search/products?minStock=5')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body[0].quantity).toBeGreaterThanOrEqual(5);
  });
});
