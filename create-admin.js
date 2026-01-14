const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Company = require('./models/Company');

const createAdminUser = async () => {
    try {
        const uri = process.env.MONGO_URI;
        await mongoose.connect(uri);
        console.log('MongoDB connected');

        // Check if company exists
        let company = await Company.findOne({ name: 'NexStock' });
        
        if (!company) {
            company = new Company({
                name: 'NexStock',
                address: 'Demo Address',
                phone: '0000000000',
                email: 'demo@nexstock.com'
            });
            await company.save();
            console.log('Company created');
        }

        // Check if admin user exists
        let user = await User.findOne({ email: 'admin@nexstock.com' });
        
        if (user) {
            console.log('Admin user already exists. Updating password to admin123...');
            user.password = 'admin123';
            await user.save();
            console.log('Admin password updated successfully!');
        } else {
            user = new User({
                name: 'Admin',
                email: 'admin@nexstock.com',
                password: 'admin123',
                role: 'admin',
                company: company._id
            });

            await user.save();
            console.log('Admin user created successfully!');
            console.log('Email: admin@nexstock.com');
            console.log('Password: admin123');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
};

createAdminUser();
