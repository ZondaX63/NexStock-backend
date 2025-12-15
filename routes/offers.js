const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const Offer = require('../models/Offer');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');

// @route   GET api/offers
// @desc    Get all offers
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const offers = await Offer.find({ company: req.user.company })
            .populate('customer', 'name email phone')
            .sort({ date: -1 });
        res.json(offers);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/offers/:id
// @desc    Get offer by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id)
            .populate('customer', 'name email phone')
            .populate('products.product', 'name sku');

        if (!offer) return res.status(404).json({ msg: 'Offer not found' });
        if (offer.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        res.json(offer);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/offers
// @desc    Create a new offer
// @access  Private
router.post('/', auth, async (req, res) => {
    const { offerNumber, customer, products, totalAmount, currency, exchangeRate, date, validUntil, description } = req.body;

    try {
        const newOffer = new Offer({
            offerNumber,
            customer,
            products,
            totalAmount,
            currency,
            exchangeRate,
            date,
            validUntil,
            description,
            company: req.user.company,
            status: 'draft'
        });

        const offer = await newOffer.save();
        res.json(offer);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/offers/:id/convert-to-invoice
// @desc    Convert offer to invoice
// @access  Private
router.post('/:id/convert-to-invoice', auth, async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) return res.status(404).json({ msg: 'Offer not found' });
        if (offer.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        // Create invoice from offer
        const invoiceNumber = 'INV-' + Date.now(); // Simple generation, can be improved
        
        const newInvoice = new Invoice({
            invoiceNumber,
            customerOrSupplier: offer.customer,
            partnerModel: 'Customer',
            products: offer.products.map(p => ({
                product: p.product,
                quantity: p.quantity,
                price: p.unitPrice,
                vat: p.taxRate,
                discount1: p.discount
            })),
            totalAmount: offer.totalAmount,
            currency: offer.currency,
            exchangeRate: offer.exchangeRate,
            date: new Date(),
            type: 'sale',
            status: 'draft',
            company: req.user.company
        });

        const invoice = await newInvoice.save();

        // Update offer status
        offer.status = 'accepted';
        await offer.save();

        res.json(invoice);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/offers/:id
// @desc    Update an offer
// @access  Private
router.put('/:id', auth, async (req, res) => {
    const { offerNumber, customer, products, totalAmount, currency, exchangeRate, date, validUntil, status, description } = req.body;

    const offerFields = { offerNumber, customer, products, totalAmount, currency, exchangeRate, date, validUntil, status, description };

    try {
        let offer = await Offer.findById(req.params.id);
        if (!offer) return res.status(404).json({ msg: 'Offer not found' });
        if (offer.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        offer = await Offer.findByIdAndUpdate(
            req.params.id,
            { $set: offerFields },
            { new: true }
        );

        res.json(offer);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/offers/:id
// @desc    Delete an offer
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) return res.status(404).json({ msg: 'Offer not found' });
        if (offer.company.toString() !== req.user.company) return res.status(401).json({ msg: 'Not authorized' });

        await Offer.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Offer removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
