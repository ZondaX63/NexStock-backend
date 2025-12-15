const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const Settings = require('../models/Settings');
const Company = require('../models/Company');

// @route   GET api/settings
// @desc    Get settings for the user's company
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        let settings = await Settings.findOne({ company: req.user.company });
        
        // If no settings exist, create them with defaults
        if (!settings) {
            settings = new Settings({ company: req.user.company });
            await settings.save();
        }

        const company = await Company.findById(req.user.company);

        res.json({ settings, company });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/settings
// @desc    Update settings for the user's company
// @access  Private (admin)
router.put('/', auth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Authorization denied' });
    }

    // Allow both flat and nested update payloads
    let companyData = req.body.companyData || {};
    let settingsData = req.body.settingsData || {};
    // Support flat fields for backward compatibility
    if (req.body.companyName) companyData.name = req.body.companyName;
    if (req.body.defaultCurrency) settingsData.currency = req.body.defaultCurrency;
    if (req.body.theme) settingsData.theme = req.body.theme;

    try {
        // Prepare data for update by removing immutable or conflicting fields
        const updatableCompanyData = { ...companyData };
        delete updatableCompanyData._id;
        delete updatableCompanyData.createdAt;
        delete updatableCompanyData.updatedAt;
        delete updatableCompanyData.__v;
        
        const updatableSettingsData = { ...settingsData };
        delete updatableSettingsData._id;
        delete updatableSettingsData.company; // This is the key field causing the unique index error
        delete updatableSettingsData.createdAt;
        delete updatableSettingsData.updatedAt;
        delete updatableSettingsData.__v;

        // Update Company details
        const company = await Company.findByIdAndUpdate(
            req.user.company,
            { $set: updatableCompanyData },
            { new: true }
        );

        // Update Settings details
        const settings = await Settings.findOneAndUpdate(
            { company: req.user.company },
            { $set: updatableSettingsData },
            { new: true, upsert: true }
        );

        res.json({ msg: 'Ayarlar başarıyla güncellendi.', company, settings, theme: settings?.theme });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
