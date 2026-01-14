const mongoose = require('mongoose');
require('dotenv').config();

async function checkSetup() {
    console.log('--- NexStock Backend Diagnostics ---');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('PORT:', process.env.PORT || '5000 (Default)');
    
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('ERROR: MONGO_URI is missing in .env');
    } else {
        console.log('MONGO_URI: Found');
        try {
            await mongoose.connect(mongoUri);
            console.log('MongoDB Connection: SUCCESS');
            
            const User = require('./models/User');
            const admin = await User.findOne({ role: 'admin' });
            if (admin) {
                console.log('Admin User: Found (' + admin.email + ')');
            } else {
                console.warn('WARNING: No admin user found in database. Run node create-admin.js');
            }

            const Company = require('./models/Company');
            const companies = await Company.countDocuments();
            console.log('Total Companies:', companies);

        } catch (err) {
            console.error('MongoDB Connection: FAILED');
            console.error('Error:', err.message);
        } finally {
            await mongoose.disconnect();
        }
    }

    if (!process.env.JWT_SECRET) {
        console.error('ERROR: JWT_SECRET is missing in .env');
    } else {
        console.log('JWT_SECRET: Found');
    }

    if (!process.env.GEMINI_API_KEY) {
        console.warn('WARNING: GEMINI_API_KEY is missing (AI features will fail)');
    } else {
        console.log('GEMINI_API_KEY: Found');
    }
    
    console.log('--- End of Diagnostics ---');
}

checkSetup();
