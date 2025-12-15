const request = require('supertest');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const User = require('../models/User');
const app = require('../server');

let adminToken, companyId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stoktakip_test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await User.deleteMany({});
  await Customer.deleteMany({});
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Admin',
      email: 'admin@b.com',
      password: 'admin123',
      role: 'admin',
      companyName: 'TestCompanyB',
      address: 'Test Address',
      phone: '555-5556',
      companyEmail: 'companyB@company.com',
      taxNumber: '223456',
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

describe('Customer API', () => {
  let customerId;
  it('should create a customer (admin)', async () => {
    const cust = await request(app)
      .post('/api/customers')
      .set('x-auth-token', adminToken)
      .send({ name: 'Test Customer', email: 'customer@test.com', phone: '555-9999', address: 'Customer Address', company: companyId });
    console.log('CUSTOMER CREATE RESPONSE:', cust.statusCode, cust.body);
    expect(cust.statusCode).toBe(200);
    customerId = cust.body._id;
    expect(customerId).toBeDefined();
  });

  it('should get all customers (auth)', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.customers)).toBe(true);
  });

  it('should update a customer (admin)', async () => {
    const res = await request(app)
      .put(`/api/customers/${customerId}`)
      .set('x-auth-token', adminToken)
      .send({ name: 'Müşteri 1 Güncel', email: 'musteri1@a.com', phone: '5551112233', address: 'Adres 1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Müşteri 1 Güncel');
  });

  it('should delete a customer (admin)', async () => {
    const res = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.msg).toBe('Customer removed');
  });
});

describe('Customer Detail API', () => {
  let customerId, productId, invoiceId;
  beforeAll(async () => {
    const Product = require('../models/Product');
    const Invoice = require('../models/Invoice');
    await Product.deleteMany({});
    const cust = await request(app)
      .post('/api/customers')
      .set('x-auth-token', adminToken)
      .send({ name: 'Detay Müşteri', email: 'detay@a.com', phone: '555-1111', address: 'Detay Adres', company: companyId });
    customerId = cust.body._id;
    expect(customerId).toBeDefined();
    const res = await request(app)
      .post('/api/products')
      .set('x-auth-token', adminToken)
      .send({ name: 'Detay Ürün', sku: 'DETAY2', quantity: 10, criticalStockLevel: 2, company: companyId });
    productId = res.body._id;
    expect(productId).toBeDefined();
    // Create invoice with product
    const inv = await request(app)
      .post('/api/invoices')
      .set('x-auth-token', adminToken)
      .send({ invoiceNumber: 'DETAYCINV', customerOrSupplier: customerId, partnerModel: 'Customer', products: [{ product: productId, quantity: 2, price: 60 }], totalAmount: 120, type: 'sale', status: 'approved', company: companyId });
    invoiceId = inv.body._id;
    expect(invoiceId).toBeDefined();
  });

  it('should return customer detail with invoices and totals', async () => {
    const res = await request(app)
      .get(`/api/customers/${customerId}`)
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.customer).toBeDefined();
    expect(Array.isArray(res.body.invoices)).toBe(true);
    expect(typeof res.body.totalPurchase).toBe('number');
    expect(typeof res.body.totalDebt).toBe('number');
    expect(typeof res.body.creditLimit).toBe('number');
    expect(typeof res.body.creditLimitExceeded).toBe('boolean');
  });
});

// Eğer /api/partners endpointi varsa aşağıdaki testi ekleyin:
// it('should get partners (auth)', async () => {
//   const res = await request(app)
//     .get('/api/partners')
//     .set('x-auth-token', adminToken);
//   expect([200, 204]).toContain(res.statusCode);
//   expect(Array.isArray(res.body)).toBe(true);
// });
