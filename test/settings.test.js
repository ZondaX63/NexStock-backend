const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Settings = require('../models/Settings');
const app = require('../index');

let adminToken, companyId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stoktakip_test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await User.deleteMany({});
  await Settings.deleteMany({});
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Admin',
      email: 'admin@settings.com',
      password: 'admin123',
      role: 'admin',
      companyName: 'TestCompanySET',
      address: 'Test Address',
      phone: '555-5562',
      companyEmail: 'companySET@company.com',
      taxNumber: '823456',
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

describe('Settings API', () => {
  it('should get settings', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('x-auth-token', adminToken);
    console.log('SETTINGS RESPONSE:', res.statusCode, res.body);
    expect(res.statusCode).toBe(200);
    expect(res.body.company?.name).toBeDefined();
    expect(['Yeni Şirket', 'TestCompanySET']).toContain(res.body.company?.name);
  });

  it('should update settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('x-auth-token', adminToken)
      .send({ companyName: 'Yeni Şirket', defaultCurrency: 'USD', theme: 'dark' });
    expect(res.statusCode).toBe(200);
    expect(res.body.company?.name).toBe('Yeni Şirket');
    expect(res.body.theme).toBe('dark');
  });
});
