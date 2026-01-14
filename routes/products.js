const express = require('express');
const router = express.Router();
const { auth, admin, manager } = require('../middleware/authMiddleware');
const Product = require('../models/Product');
const { check } = require('express-validator');
const Notification = require('../models/Notification');
const logAction = require('../middleware/logAction');
const mongoose = require('mongoose');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { parseExcel, generateExcel } = require('../services/excelService');

// ... existing imports ...
// @route   POST api/products
// @desc    Create a product
// @access  Private
router.post('/', [auth, manager, [
    check('name', 'Name is required').not().isEmpty(),
    check('sku', 'SKU is required').not().isEmpty(),
    check('unit', 'Unit is required').not().isEmpty(),
]], async (req, res) => {
    const {
        name, sku, description, barcode, tags, unit,
        purchasePrice, salePrice, quantity, criticalStockLevel, trackStock,
        brand, category, shelfLocation, currency, priceUSD, priceEUR
    } = req.body;

    console.log('Received product data:', req.body);

    try {
        let product = await Product.findOne({ sku, company: req.user.company });
        if (product) {
            return res.status(400).json({ errors: [{ msg: 'Product with this SKU already exists' }] });
        }

        // Convert empty strings to null for ObjectId fields
        const categoryId = category && category !== '' ? category : null;
        const brandId = brand && brand !== '' ? brand : null;

        product = new Product({
            name, sku, description, barcode, tags, unit,
            purchasePrice, salePrice, quantity, criticalStockLevel, trackStock,
            brand: brandId, category: categoryId, shelfLocation, currency, priceUSD, priceEUR,
            company: req.user.company
        });

        await product.save();
        // Kritik stok bildirimi
        if (trackStock && quantity <= (criticalStockLevel || 0)) {
            const existing = await Notification.findOne({
                type: 'critical_stock',
                relatedId: product._id,
                company: req.user.company,
                read: false
            });
            if (!existing) {
                await Notification.create({
                    type: 'critical_stock',
                    message: `${name} ürünü kritik stok seviyesinin altında!`,
                    relatedId: product._id,
                    company: req.user.company
                });
            }
        }
        await logAction({
            user: req.user.id,
            action: 'create',
            module: 'product',
            targetId: product._id,
            targetName: product.name,
            message: `${req.user.name}, ${product.name} ürününü ekledi.`,
            company: req.user.company
        });
        res.json(product);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/products/import
// @desc    Import products from Excel
// @access  Private/Manager
router.post('/import', [auth, manager, upload.single('file')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded' });
        }

        const data = parseExcel(req.file.buffer);
        const results = {
            processed: 0,
            created: 0,
            updated: 0,
            errors: []
        };

        for (const row of data) {
            try {
                // Basic validation
                if (!row.Name || !row.SKU) {
                    results.errors.push({ row, error: 'Name and SKU are required. Headers: Name, SKU, ...' });
                    continue;
                }

                const productData = {
                    name: row.Name,
                    sku: row.SKU,
                    description: row.Description || '',
                    barcode: row.Barcode || '',
                    unit: row.Unit || 'Adet',
                    purchasePrice: row.PurchasePrice || 0,
                    salePrice: row.SalePrice || 0,
                    quantity: row.Quantity || 0,
                    criticalStockLevel: row.CriticalStock || 10,
                    trackStock: true,
                    brand: null,
                    category: null,
                    company: req.user.company
                };

                let product = await Product.findOne({ sku: row.SKU, company: req.user.company });

                if (product) {
                    // Update
                    product = await Product.findOneAndUpdate(
                        { sku: row.SKU, company: req.user.company },
                        { $set: productData },
                        { new: true }
                    );
                    results.updated++;
                } else {
                    // Create
                    product = new Product(productData);
                    await product.save();
                    results.created++;
                }
                results.processed++;
            } catch (err) {
                results.errors.push({ row, error: err.message });
            }
        }

        await logAction({
            user: req.user.id,
            action: 'import',
            module: 'product',
            message: `${req.user.name}, Excel ile ${results.processed} ürün aktardı.`,
            company: req.user.company
        });

        res.json(results);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/products/export
// @desc    Export products to Excel
// @access  Private
router.get('/export', auth, async (req, res) => {
    try {
        const products = await Product.find({ company: req.user.company }).lean();

        const data = products.map(p => ({
            Name: p.name,
            SKU: p.sku,
            Description: p.description,
            Barcode: p.barcode,
            Unit: p.unit,
            PurchasePrice: p.purchasePrice,
            SalePrice: p.salePrice,
            Quantity: p.quantity,
            CriticalStock: p.criticalStockLevel
        }));

        const buffer = generateExcel(data, 'Products');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=products.xlsx');
        res.send(buffer);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/products
// @desc    Get all products with pagination, sorting, search and filtering
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, sort = 'name', order = 'asc', search = '', category, brand, supplier, lowStock } = req.query;

        const query = { company: req.user.company };

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.name = searchRegex;
        }

        if (category) {
            query.category = category;
        }

        if (brand) {
            query.brand = brand;
        }

        if (supplier) {
            query.supplier = supplier;
        }

        if (lowStock === 'true') {
            query.trackStock = true;
            query.$expr = { $lte: ["$quantity", "$criticalStockLevel"] };
        }

        // If limit is 0, return all documents, otherwise paginate
        if (parseInt(limit, 10) === 0) {
            const products = await Product.find(query).sort({ [sort]: order === 'asc' ? 1 : -1 });
            return res.json({ products });
        }

        const allowedSortFields = ['name', 'sku', 'quantity', 'salePrice'];
        if (!allowedSortFields.includes(sort)) {
            return res.status(400).json({ errors: [{ msg: 'Invalid sort field' }] });
        }

        const options = {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            sort: { [sort]: order === 'asc' ? 1 : -1 },
        };

        const result = await Product.paginate(query, options);

        res.json({
            products: result.docs,
            totalProducts: result.totalDocs,
            totalPages: result.totalPages,
            currentPage: result.page,
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/products/stats
// @desc    Get product statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
    try {
        const stats = await Product.aggregate([
            { $match: { company: req.user.company } },
            {
                $facet: {
                    total: [{ $count: 'count' }],
                    lowStock: [
                        { $match: { trackStock: true, $expr: { $lte: ["$quantity", "$criticalStockLevel"] } } },
                        { $count: 'count' }
                    ],
                    distinctUnits: [{ $group: { _id: '$unit' } }]
                }
            }
        ]);
        res.json({
            total: stats[0].total[0]?.count || 0,
            lowStock: stats[0].lowStock[0]?.count || 0,
            distinctUnits: stats[0].distinctUnits.length
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/products/:id
// @desc    Update a product
// @access  Private
router.put('/:id', [auth, manager], async (req, res) => {
    const {
        name, sku, description, barcode, tags, unit,
        purchasePrice, salePrice, quantity, criticalStockLevel, trackStock,
        brand, category, shelfLocation, currency, priceUSD, priceEUR
    } = req.body;

    const productFields = {};
    if (name) productFields.name = name;
    if (sku) productFields.sku = sku;
    if (description) productFields.description = description;
    if (barcode) productFields.barcode = barcode;
    if (tags) productFields.tags = tags;
    if (unit) productFields.unit = unit;
    if (purchasePrice !== undefined) productFields.purchasePrice = purchasePrice;
    if (salePrice !== undefined) productFields.salePrice = salePrice;
    if (quantity !== undefined) productFields.quantity = quantity;
    if (criticalStockLevel !== undefined) productFields.criticalStockLevel = criticalStockLevel;
    if (trackStock !== undefined) productFields.trackStock = trackStock;
    if (brand !== undefined) {
        // Allow null, empty string, or valid ObjectId for brand
        if (brand === null || brand === "") {
            productFields.brand = null;
        } else if (mongoose.Types.ObjectId.isValid(brand)) {
            productFields.brand = brand;
        } else {
            return res.status(400).json({ msg: 'Invalid brand ID' });
        }
    }
    if (category !== undefined) {
        console.log('Validating category field:', category);
        // Allow null, empty string, or valid ObjectId
        if (category === null || category === "") {
            productFields.category = null;
        } else if (mongoose.Types.ObjectId.isValid(category)) {
            productFields.category = category;
        } else {
            return res.status(400).json({ msg: 'Invalid category ID' });
        }
    }
    if (shelfLocation !== undefined) productFields.shelfLocation = shelfLocation;
    if (currency) productFields.currency = currency;
    if (priceUSD !== undefined) productFields.priceUSD = priceUSD;
    if (priceEUR !== undefined) productFields.priceEUR = priceEUR;

    try {
        let product = await Product.findOne({ _id: req.params.id, company: req.user.company });

        if (!product) return res.status(404).json({ msg: 'Product not found' });

        // Check if SKU is being changed to one that already exists for the company
        if (sku && sku !== product.sku) {
            const existingProduct = await Product.findOne({ sku, company: req.user.company });
            if (existingProduct) {
                return res.status(400).json({ msg: 'Product with this SKU already exists' });
            }
        }

        product = await Product.findByIdAndUpdate(
            req.params.id,
            { $set: productFields },
            { new: true }
        );

        // Kritik stok bildirimi
        if (product.trackStock && product.quantity <= product.criticalStockLevel) {
            const existing = await Notification.findOne({
                type: 'critical_stock',
                relatedId: product._id,
                company: req.user.company,
                read: false
            });
            if (!existing) {
                await Notification.create({
                    type: 'critical_stock',
                    message: `${product.name} ürünü kritik stok seviyesinin altında!`,
                    relatedId: product._id,
                    company: req.user.company
                });
            }
        }
        await logAction({
            user: req.user.id,
            action: 'update',
            module: 'product',
            targetId: product._id,
            targetName: product.name,
            message: `${req.user.name}, ${product.name} ürününü güncelledi.`,
            company: req.user.company
        });
        res.json(product);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/products/:id
// @desc    Delete a product
// @access  Private/Admin
router.delete('/:id', [auth, admin], async (req, res) => {
    try {
        let product = await Product.findOne({ _id: req.params.id, company: req.user.company });

        if (!product) return res.status(404).json({ msg: 'Product not found' });

        await Product.findByIdAndDelete(req.params.id);
        await logAction({
            user: req.user.id,
            action: 'delete',
            module: 'product',
            targetId: product._id,
            targetName: product.name,
            message: `${req.user.name}, ${product.name} ürününü sildi.`,
            company: req.user.company
        });
        res.json({ msg: 'Product removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/products/:id
// @desc    Get product details with category and brand
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.params.id, company: req.user.company })
            .populate('category', 'name')
            .populate('brand', 'name')
            .populate('company', 'name');
        if (!product) return res.status(404).json({ msg: 'Product not found' });

        // Alış/satış geçmişi (ilgili faturalar)
        const Invoice = require('../models/Invoice');
        const invoices = await Invoice.find({
            'products.product': product._id,
            company: req.user.company
        })
            .populate('customerOrSupplier', 'name')
            .sort({ date: -1 });

        // Stok hareketleri
        const StockMovement = require('../models/StockMovement');
        const movements = await StockMovement.find({
            product: product._id,
            company: req.user.company
        })
            .populate('invoice', 'invoiceNumber type date')
            .sort({ date: -1 });

        res.json({ product, invoices, movements });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/products/import-stock-count
// @desc    Import stock count results from mobile app
// @access  Private
router.post('/import-stock-count', auth, async (req, res) => {
    try {
        const { stockUpdates, countDate, totalItemsCounted, totalQuantityCounted, countType, deviceInfo } = req.body;

        if (!stockUpdates || !Array.isArray(stockUpdates)) {
            return res.status(400).json({ msg: 'Stock updates array is required' });
        }

        const results = {
            success: [],
            errors: [],
            updated: 0,
            created: 0
        };

        for (const update of stockUpdates) {
            try {
                const { sku, quantity, countedQuantity, countDate: itemCountDate, countNotes } = update;

                if (!sku) {
                    results.errors.push({ error: 'SKU is required', data: update });
                    continue;
                }

                // SKU ile ürünü bul
                let product = await Product.findOne({ sku, company: req.user.company });

                if (product) {
                    // Mevcut ürünü güncelle
                    const oldQuantity = product.quantity;
                    product.quantity = countedQuantity || quantity || 0;
                    product.lastCountDate = new Date(itemCountDate || countDate);
                    product.lastCountNotes = countNotes || '';

                    // Diğer alanları da güncelle (mobil uygulamadan gelen veriler varsa)
                    if (update.name) product.name = update.name;
                    if (update.barcode) product.barcode = update.barcode;
                    if (update.description) product.description = update.description;
                    if (update.tags) product.tags = update.tags;
                    if (update.unit) product.unit = update.unit;
                    if (update.purchasePrice !== undefined) product.purchasePrice = update.purchasePrice;
                    if (update.salePrice !== undefined) product.salePrice = update.salePrice;
                    if (update.criticalStockLevel !== undefined) product.criticalStockLevel = update.criticalStockLevel;
                    if (update.trackStock !== undefined) product.trackStock = update.trackStock;
                    if (update.shelfLocation) product.shelfLocation = update.shelfLocation;

                    await product.save();

                    // Stok hareketi oluştur
                    const StockMovement = require('../models/StockMovement');
                    await StockMovement.create({
                        product: product._id,
                        type: countedQuantity > oldQuantity ? 'in' : 'out',
                        quantity: Math.abs(countedQuantity - oldQuantity),
                        date: new Date(itemCountDate || countDate),
                        company: req.user.company,
                        notes: `Mobil stok sayımı: ${countNotes || 'Sayım güncellemesi'}`
                    });

                    results.success.push({ sku, oldQuantity, newQuantity: product.quantity });
                    results.updated++;

                    // Kritik stok kontrolü ve bildirim
                    if (product.trackStock && product.quantity <= product.criticalStockLevel) {
                        const existing = await Notification.findOne({
                            type: 'critical_stock',
                            relatedId: product._id,
                            company: req.user.company,
                            read: false
                        });
                        if (!existing) {
                            await Notification.create({
                                type: 'critical_stock',
                                message: `${product.name} ürünü kritik stok seviyesinin altında! (Stok: ${product.quantity})`,
                                relatedId: product._id,
                                company: req.user.company
                            });
                        }
                    }
                } else {
                    // Yeni ürün oluştur (eğer tüm gerekli bilgiler varsa)
                    if (update.name && update.unit) {
                        product = new Product({
                            name: update.name,
                            sku: sku,
                            barcode: update.barcode || '',
                            description: update.description || '',
                            tags: update.tags || [],
                            unit: update.unit,
                            purchasePrice: update.purchasePrice || 0,
                            salePrice: update.salePrice || 0,
                            quantity: countedQuantity || quantity || 0,
                            criticalStockLevel: update.criticalStockLevel !== undefined ? update.criticalStockLevel : 0,
                            trackStock: update.trackStock !== undefined ? update.trackStock : true,
                            shelfLocation: update.shelfLocation || '',
                            company: req.user.company,
                            lastCountDate: new Date(itemCountDate || countDate),
                            lastCountNotes: countNotes || 'Mobil uygulamadan oluşturuldu'
                        });

                        await product.save();
                        results.success.push({ sku, created: true, quantity: product.quantity });
                        results.created++;
                    } else {
                        results.errors.push({
                            error: 'Product not found and insufficient data to create new product',
                            sku: sku,
                            required: ['name', 'unit']
                        });
                    }
                }
            } catch (error) {
                results.errors.push({
                    error: error.message,
                    sku: update.sku || 'unknown'
                });
            }
        }

        // Log işlemi
        await logAction({
            user: req.user.id,
            action: 'import',
            module: 'product',
            message: `${req.user.name}, mobil uygulamadan ${totalItemsCounted} ürün sayımı import etti. (${results.updated} güncellendi, ${results.created} oluşturuldu)`,
            company: req.user.company,
            details: {
                countType,
                deviceInfo,
                totalItemsCounted,
                totalQuantityCounted,
                results
            }
        });

        res.json({
            message: 'Stock count import completed',
            ...results,
            summary: {
                totalProcessed: stockUpdates.length,
                successful: results.success.length,
                failed: results.errors.length,
                updated: results.updated,
                created: results.created
            }
        });

    } catch (err) {
        console.error('Stock count import error:', err);
        res.status(500).json({
            msg: 'Server Error during stock count import',
            error: err.message
        });
    }
});

module.exports = router;
