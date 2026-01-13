const express = require('express');
const connectDB = require('./config/db');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
// Trust first proxy (required for correct client IP when behind reverse proxies)
app.set('trust proxy', 1);

// Connect Database
console.log('Attempting to connect to DB...');
console.log('MONGO_URI present:', !!process.env.MONGO_URI);
connectDB().then(() => {
  console.log('DB Connection Initialized');
}).catch((err) => {
  console.error('Database connection failed:', err.message);
  // process.exit(1); // Removed for serverless stability
});

// Middleware - CORS Configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-auth-token', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ extended: false }));
// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// Basic rate limiter (tune as needed)
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings')); // Ayarlar (settings) endpointi eklendi
app.use('/api/autocomplete', require('./routes/autocomplete'));// Otomatik tamamlama (autocomplete) endpointi eklendi
app.use('/api/search', require('./routes/search')); // Dinamik arama, filtreleme, sıralama endpointi eklendi
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/orders', require('./routes/orders')); // Kritik stok bildirimleri endpointi eklendi
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/movements', require('./routes/movements'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/logs', require('./routes/logs'));
// ... diğer route'lar buraya eklenebilir

// Serve static frontend if build exists (monolith image)
const path = require('path');
const fs = require('fs');
const staticDir = path.join(__dirname, 'public');

const indexHtmlPath = path.join(staticDir, 'index.html');
if (process.env.NODE_ENV === 'production' || fs.existsSync(indexHtmlPath)) {
  app.use(express.static(staticDir));
  // SPA fallback to index.html for non-API routes
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(indexHtmlPath);
  });
} else {
  console.log(`Frontend build not found at ${indexHtmlPath} — static serving disabled for development.`);
}

// Health endpoint for Docker/monitoring
app.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ status: 'ok', database: dbStatus });
});

// Root endpoint
app.get('/', (req, res) => res.send('NexStock API Running'));
// Favicon handler
app.get('/favicon.ico', (req, res) => res.status(204).end());

const PORT = process.env.PORT || 5000;

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
}

const logger = require('./utils/logger'); // Example logger utility
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

module.exports = app;
