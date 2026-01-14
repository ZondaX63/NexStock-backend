const request = require('supertest');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
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
      email: 'admin@a.com',
      password: 'admin123',
      role: 'admin',
      companyName: 'TestCompanyA',
      address: 'Test Address',
      phone: '555-5555',
      companyEmail: 'companyA@company.com',
      taxNumber: '123456',
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
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Product API', () => {
  let productId;
  it('should not allow unauthenticated access', async () => {
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toBe(401);
  });

  it('should create a product (admin)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('x-auth-token', adminToken)
      .send({ name: 'Kalem', sku: 'KLM001', quantity: 100, criticalStockLevel: 10, company: companyId });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Kalem');
    productId = res.body._id;
    expect(productId).toBeDefined();
  });

  it('should get all products (auth)', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('x-auth-token', adminToken);
    console.log('PRODUCT LIST RESPONSE:', res.statusCode, res.body);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
  });

  it('should update a product (admin)', async () => {
    const res = await request(app)
      .put(`/api/products/${productId}`)
      .set('x-auth-token', adminToken)
      .send({ name: 'Kalem 2', sku: 'KLM002', quantity: 50, criticalStockLevel: 5 });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Kalem 2');
  });

  it('should delete a product (admin)', async () => {
    const res = await request(app)
      .delete(`/api/products/${productId}`)
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.msg).toBe('Product removed');
  });
});

describe('Product Detail API', () => {
  let adminToken, productId, customerId, invoiceId;
  beforeAll(async () => {
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    const Invoice = require('../models/Invoice');
    await User.deleteMany({});
    await Customer.deleteMany({});
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Admin', email: 'admin@prod.com', password: 'admin123', role: 'admin', companyName: 'TestCompanyPROD', address: 'Test Address', phone: '555-5550', companyEmail: 'companyPROD@company.com', taxNumber: '523456', currency: 'TRY', units: ['adet'] });
    adminToken = res.body.token;
    companyId = res.body.user?.company || res.body.company || res.body.companyId;
    expect(adminToken).toBeDefined();
    expect(companyId).toBeDefined();
    // Create customer
    const cust = await request(app)
      .post('/api/customers')
      .set('x-auth-token', adminToken)
      .send({ name: 'Müşteri Detay', email: 'detay@a.com', phone: '5551112233', address: 'Adres Detay', company: companyId });
    customerId = cust.body._id;
    expect(customerId).toBeDefined();
    // Create product
    const prod = await request(app)
      .post('/api/products')
      .set('x-auth-token', adminToken)
      .send({ name: 'Detay Ürün', sku: 'DETAY1', quantity: 10, criticalStockLevel: 2, company: companyId });
    productId = prod.body._id;
    expect(productId).toBeDefined();
    // Create invoice with product
    const inv = await request(app)
      .post('/api/invoices')
      .set('x-auth-token', adminToken)
      .send({ invoiceNumber: 'DETAYINV', customerOrSupplier: customerId, partnerModel: 'Customer', products: [{ product: productId, quantity: 2, price: 50 }], totalAmount: 100, type: 'sale', company: companyId });
    invoiceId = inv.body._id;
    expect(invoiceId).toBeDefined();
  });

  it('should return product detail with invoices and movements', async () => {
    const res = await request(app)
      .get(`/api/products/${productId}`)
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.product).toBeDefined();
    expect(Array.isArray(res.body.invoices)).toBe(true);
    expect(Array.isArray(res.body.movements)).toBe(true);
    // At least one invoice should include the product
    expect(res.body.invoices.some(inv => inv.invoiceNumber === 'DETAYINV')).toBe(true);
  });
});

describe('Critical Stock Export', () => {
  let adminToken, productId;
  beforeAll(async () => {
    const User = require('../models/User');
    await User.deleteMany({});
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Admin', email: 'admin@kritik.com', password: 'admin123', role: 'admin', companyName: 'TestCompanyKRITIK', address: 'Test Address', phone: '555-5551', companyEmail: 'companyKRITIK@company.com', taxNumber: '623456', currency: 'TRY', units: ['adet'] });
    adminToken = res.body.token;
    companyId = res.body.user?.company || res.body.company || res.body.companyId;
    expect(adminToken).toBeDefined();
    expect(companyId).toBeDefined();
    // Create critical stock product
    const prod = await request(app)
      .post('/api/products')
      .set('x-auth-token', adminToken)
      .send({ name: 'Kritik Ürün', sku: 'KRITIK1', quantity: 1, criticalStockLevel: 5, company: companyId });
    productId = prod.body._id;
    expect(productId).toBeDefined();
  });

  it('should export only critical stock products', async () => {
    const res = await request(app)
      .get('/api/products?lowStock=true&limit=0')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.every(p => p.quantity <= p.criticalStockLevel)).toBe(true);
  });
});
