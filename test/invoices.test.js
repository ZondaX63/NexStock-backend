const request = require('supertest');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const User = require('../models/User');
const app = require('../index');

let adminToken, companyId, customerId, productId;

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
      email: 'admin@d.com',
      password: 'admin123',
      role: 'admin',
      companyName: 'TestCompanyD',
      address: 'Test Address',
      phone: '555-5557',
      companyEmail: 'companyD@company.com',
      taxNumber: '323456',
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
  // Create customer and product for all tests
  const cust = await request(app)
    .post('/api/customers')
    .set('x-auth-token', adminToken)
    .send({ name: 'Müşteri Fatura', email: 'musteri@fatura.com', phone: '5553334455', address: 'Adres Fatura', company: companyId });
  console.log('CUSTOMER CREATE RESPONSE:', cust.statusCode, cust.body);
  expect(cust.statusCode).toBe(200);
  customerId = cust.body._id;
  expect(customerId).toBeDefined();
  const prod = await request(app)
    .post('/api/products')
    .set('x-auth-token', adminToken)
    .send({ name: 'Ürün Fatura', sku: 'FTR001', quantity: 100, criticalStockLevel: 10, company: companyId });
  console.log('PRODUCT CREATE RESPONSE:', prod.statusCode, prod.body);
  expect(prod.statusCode).toBe(200);
  productId = prod.body._id;
  expect(productId).toBeDefined();
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Invoice API', () => {
  let invoiceId;
  it('should create an invoice (auth)', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('x-auth-token', adminToken)
      .send({
        invoiceNumber: 'INV001',
        customerOrSupplier: customerId,
        partnerModel: 'Customer',
        products: [{ product: productId, quantity: 2, price: 50 }],
        totalAmount: 100,
        type: 'sale',
        company: companyId
      });
    console.log('INVOICE CREATE RESPONSE:', res.statusCode, res.body);
    expect(res.statusCode).toBe(200);
    expect(res.body.invoiceNumber).toBe('INV001');
    invoiceId = res.body._id;
  });

  it('should get all invoices (auth)', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.invoices)).toBe(true);
  });

  it('should get invoice by id (auth)', async () => {
    const res = await request(app)
      .get(`/api/invoices/${invoiceId}`)
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.invoiceNumber).toBe('INV001');
  });
});

describe('Due Date Notification', () => {
  let adminToken, customerId, productId, invoiceId;
  beforeAll(async () => {
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    const Product = require('../models/Product');
    await User.deleteMany({});
    await Customer.deleteMany({});
    await Product.deleteMany({});
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Admin', email: 'admin@vade.com', password: 'admin123', role: 'admin', companyName: 'TestCompanyVADE', address: 'Test Address', phone: '555-5558', companyEmail: 'companyVADE@company.com', taxNumber: '423456', currency: 'TRY', units: ['adet'] });
    adminToken = res.body.token;
    companyId = res.body.user?.company || res.body.company || res.body.companyId;
    expect(adminToken).toBeDefined();
    expect(companyId).toBeDefined();
    // Create customer
    const cust = await request(app)
      .post('/api/customers')
      .set('x-auth-token', adminToken)
      .send({ name: 'Vade Müşteri', email: 'vade@a.com', phone: '5551112233', address: 'Adres Vade', company: companyId });
    customerId = cust.body._id;
    expect(customerId).toBeDefined();
    // Create product
    const prod = await request(app)
      .post('/api/products')
      .set('x-auth-token', adminToken)
      .send({ name: 'Vade Ürün', sku: 'VADE1', quantity: 10, criticalStockLevel: 2, company: companyId });
    productId = prod.body._id;
    expect(productId).toBeDefined();
    // Create invoice with dueDate within 3 days
    const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const inv = await request(app)
      .post('/api/invoices')
      .set('x-auth-token', adminToken)
      .send({ invoiceNumber: 'VADEINV', customerOrSupplier: customerId, partnerModel: 'Customer', products: [{ product: productId, quantity: 2, price: 50 }], totalAmount: 100, type: 'sale', dueDate, company: companyId });
    invoiceId = inv.body._id;
    expect(invoiceId).toBeDefined();
  });

  it('should create a due_date notification for soon due invoice', async () => {
    await request(app)
      .get('/api/invoices/due-soon')
      .set('x-auth-token', adminToken);
    const notifRes = await request(app)
      .get('/api/notifications')
      .set('x-auth-token', adminToken);
    expect(notifRes.body.some(n => n.type === 'due_date')).toBe(true);
  });
});
