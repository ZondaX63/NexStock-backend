const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');

describe('Dashboard API', () => {
  let adminToken;
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stoktakip_test', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    await User.deleteMany({});
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin',
        email: 'admin@dash.com',
        password: 'admin123',
        role: 'admin',
        companyName: 'TestCompanyDASH',
        address: 'Test Address',
        phone: '555-5551',
        companyEmail: 'companyDASH@company.com',
        taxNumber: '223456',
        currency: 'TRY',
        units: ['adet']
      });
    adminToken = res.body.token;
  });
  afterAll(async () => {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });
  it('should get dashboard stats (auth)', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('x-auth-token', adminToken);
    expect([200, 204]).toContain(res.statusCode);
    expect(typeof res.body).toBe('object');
  });
  it('should get dashboard summary (auth)', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('x-auth-token', adminToken);
    expect([200, 204]).toContain(res.statusCode);
    expect(typeof res.body).toBe('object');
  });
  it('should not allow unauthenticated access', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.statusCode).toBe(401);
  });
}); 