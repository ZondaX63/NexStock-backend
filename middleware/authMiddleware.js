const jwt = require('jsonwebtoken');
require('dotenv').config();

const auth = async (req, res, next) => {
    const token = req.header('x-auth-token');

    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user; // Include role and company in the token payload
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ msg: 'Token has expired' });
        }
        console.error('Auth middleware error:', err);
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

const admin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied: Admin only' });
    }
    next();
};

const manager = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'manager')) {
        return res.status(403).json({ msg: 'Access denied: Manager or Admin only' });
    }
    next();
};

const staff = (req, res, next) => {
    // Staff is the lowest level, so all valid users (who passed auth) are at least staff
    // This middleware exists mostly for clarity or if we have 'guest' roles later
    if (!req.user) {
        return res.status(401).json({ msg: 'Authorization denied' });
    }
    next();
};

module.exports = { auth, admin, manager, staff };
