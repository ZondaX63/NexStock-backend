const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const app = require('../server');

let adminToken, companyId;

const testUser = {
  name: 'Test User',
  email: 'testuser@auth.com',
  password: 'testpass123',
  role: 'admin',
  companyName: 'TestCompanyAUTH',
  address: 'Test Address',
  phone: '555-5565',
  companyEmail: 'companyAUTH@company.com',
  taxNumber: '233456',
  currency: 'TRY',
  units: ['adet']
};

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stoktakip_test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await User.deleteMany({});
  await Company.deleteMany({});
  // Register admin and company in one step
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Test User',
      email: 'testuser@auth.com',
      password: 'testpass123',
      role: 'admin',
      companyName: 'TestCompanyAUTH',
      address: 'Test Address',
      phone: '555-5565',
      companyEmail: 'companyAUTH@company.com',
      taxNumber: '233456',
      currency: 'TRY',
      units: ['adet']
    });
  console.log('REGISTER RESPONSE:', res.statusCode, res.body);
  expect(res.statusCode).toBe(200);
  expect(res.body.token).toBeDefined();
  const cid = res.body.user?.company || res.body.company || res.body.companyId;
  expect(cid).toBeDefined();
  adminToken = res.body.token;
  companyId = cid;
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Auth API', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Another User',
        email: 'anotheruser@auth.com',
        password: 'testpass456',
        role: 'admin',
        companyName: 'TestCompanyAUTH2',
        address: 'Test Address',
        phone: '555-5566',
        companyEmail: 'companyAUTH2@company.com',
        taxNumber: '233457',
        currency: 'TRY',
        units: ['adet']
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    const cid = res.body.user?.company || res.body.company || res.body.companyId;
    expect(cid).toBeDefined();
  });

  it('should not register with existing email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    expect(res.statusCode).toBe(400);
  });

  it('should not register with missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@a.com' });
    expect(res.statusCode).toBe(400);
  });

  it('should login with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    const cid = res.body.user?.company || res.body.company || res.body.companyId;
    expect(cid).toBeDefined();
  });

  it('should not login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrongpass' });
    expect(res.statusCode).toBe(400);
  });

  it('should not login with non-existing user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nouser@example.com', password: 'test1234' });
    expect(res.statusCode).toBe(400);
  });
});
