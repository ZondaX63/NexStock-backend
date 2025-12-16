const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');
const Company = require('../models/Company');
const { auth, admin } = require('../middleware/authMiddleware');
require('dotenv').config();

// @route   POST api/auth/register
// @desc    Register company and first admin user
// @access  Public
router.post('/register', [
    check('companyName', 'Company name is required').not().isEmpty(),
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { companyName, name, email, password } = req.body;

    try {
        let company = await Company.findOne({ name: companyName });
        if (company) {
            return res.status(400).json({ msg: 'Company already exists' });
        }
        company = new Company({ name: companyName });
        await company.save();

        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }
        user = new User({
            name,
            email,
            password,
            role: 'admin',
            company: company._id
        });
        await user.save();

        const payload = {
            user: {
                id: user.id,
                role: user.role,
                company: company._id
            }
        };

        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 3600 }, async (err, token) => {
            if (err) throw err;
            // Populate user for response
            const populatedUser = await User.findById(user._id).select('-password').populate('company', 'name');
            res.json({
                token,
                user: {
                    id: populatedUser._id,
                    name: populatedUser.name,
                    email: populatedUser.email,
                    role: populatedUser.role,
                    company: populatedUser.company?._id || company._id
                },
                company: company._id,
                companyId: company._id
            });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        let user = await User.findOne({ email }).populate('company', 'name');

        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const payload = {
            user: {
                id: user.id,
                role: user.role,
                company: user.company?._id || user.company
            }
        };

        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 3600 }, (err, token) => {
            if (err) throw err;
            res.json({
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    company: user.company?._id || user.company
                },
                company: user.company?._id || user.company,
                companyId: user.company?._id || user.company
            });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   POST api/auth/add-user
// @desc    Add a new user (personnel) to the company (admin only)
// @access  Private/Admin
router.post('/add-user', [auth, admin, check('name', 'Name is required').not().isEmpty(), check('email', 'Please include a valid email').isEmail(), check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }), check('role', 'Role is required').isIn(['user', 'admin'])], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, email, password, role } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }
        user = new User({
            name,
            email,
            password,
            role,
            company: req.user.company
        });
        await user.save();
        res.json({ msg: 'User added', user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   GET api/auth/company-users
// @desc    Get all users for the admin's company
// @access  Private/Admin
router.get('/company-users', [auth, admin], async (req, res) => {
    try {
        const users = await User.find({ company: req.user.company }).select('-password');
        res.json(users);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/auth/user/:id
// @desc    Delete a user from the company
// @access  Private/Admin
router.delete('/user/:id', [auth, admin], async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.params.id, company: req.user.company });
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        if (user.id === req.user.id) {
            return res.status(400).json({ msg: 'You cannot delete yourself' });
        }
        await User.findByIdAndDelete(req.params.id);
        res.json({ msg: 'User removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/auth/me
// @desc    Get current user details
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const connectDB = require('../config/db');
        
        // Ensure DB connection
        if (mongoose.connection.readyState !== 1) {
            console.log('DB not connected in /auth/me, attempting to connect...');
            await connectDB();
        }
        
        // req.user.id is coming from the auth middleware
        const user = await User.findById(req.user.id).select('-password').populate('company', 'name');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error('Error in /auth/me:', err.message);
        console.error('Full error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

module.exports = router;
