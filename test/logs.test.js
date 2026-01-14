const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');

describe('Logs API', () => {
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
        email: 'admin@logs.com',
        password: 'admin123',
        role: 'admin',
        companyName: 'TestCompanyLOG',
        address: 'Test Address',
        phone: '555-5550',
        companyEmail: 'companyLOG@company.com',
        taxNumber: '123456',
        currency: 'TRY',
        units: ['adet']
      });
    adminToken = res.body.token;
  });
  afterAll(async () => {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });
  it('should get logs (auth)', async () => {
    const res = await request(app)
      .get('/api/logs')
      .set('x-auth-token', adminToken);
    expect([200, 204]).toContain(res.statusCode);
    expect(Array.isArray(res.body)).toBe(true);
  });
  it('should not allow unauthenticated access', async () => {
    const res = await request(app).get('/api/logs');
    expect(res.statusCode).toBe(401);
  });
}); 