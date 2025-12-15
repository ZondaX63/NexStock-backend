const request = require('supertest');
const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const User = require('../models/User');
const app = require('../server');

let adminToken, companyId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stoktakip_test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await User.deleteMany({});
  await Supplier.deleteMany({});
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Admin',
      email: 'admin@sup.com',
      password: 'admin123',
      role: 'admin',
      companyName: 'TestCompanySUP',
      address: 'Test Address',
      phone: '555-5558',
      companyEmail: 'companySUP@company.com',
      taxNumber: '423456',
      currency: 'TRY',
      units: ['adet']
    });
  console.log('REGISTER RESPONSE:', res.statusCode, res.body);
  expect(res.statusCode).toBe(200);
  expect(res.body.token).toBeDefined();
  adminToken = res.body.token;
  companyId = res.body.user?.company || res.body.company || res.body.companyId;
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Supplier API', () => {
  let supplierId;
  it('should create a supplier (admin)', async () => {
    const res = await request(app)
      .post('/api/suppliers')
      .set('x-auth-token', adminToken)
      .send({ name: 'Tedarikçi 1', contactPerson: 'Yetkili', email: 'tedarikci1@a.com', phone: '5552223344' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Tedarikçi 1');
    supplierId = res.body._id;
  });

  it('should get all suppliers (auth)', async () => {
    const res = await request(app)
      .get('/api/suppliers')
      .set('x-auth-token', adminToken);
    console.log('SUPPLIER LIST RESPONSE:', res.statusCode, res.body);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.suppliers)).toBe(true);
  });

  it('should update a supplier (admin)', async () => {
    const res = await request(app)
      .put(`/api/suppliers/${supplierId}`)
      .set('x-auth-token', adminToken)
      .send({ name: 'Tedarikçi 1 Güncel', contactPerson: 'Yetkili', email: 'tedarikci1@a.com', phone: '5552223344' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Tedarikçi 1 Güncel');
  });

  it('should delete a supplier (admin)', async () => {
    const res = await request(app)
      .delete(`/api/suppliers/${supplierId}`)
      .set('x-auth-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.msg).toBe('Supplier removed');
  });
});
