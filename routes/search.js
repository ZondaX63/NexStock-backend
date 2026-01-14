const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Invoice = require('../models/Invoice');

// Gelişmiş ürün arama - OEM gruplu
router.get('/products', auth, async (req, res) => {
    try {
        const { q, sort, minStock, maxStock, groupByOem = 'false' } = req.query;
        
        console.log('🔍 Arama isteği:', { q, userId: req.user.id, company: req.user.company });
        
        let allProducts = [];
        let isOemGroupSearch = false;
        const searchTerm = q ? q.trim() : '';

        if (searchTerm.length > 0) {
            // 1. Önce OEM kodu ile direkt arama
            console.log('1️⃣ OEM araması başlıyor...', searchTerm);
            const oemProducts = await Product.find({
                oem: { $regex: searchTerm, $options: 'i' },
                company: req.user.company
            }).populate('category brand', 'name').lean();
            
            console.log('OEM sonuçları:', oemProducts.length);

            if (oemProducts.length > 0) {
                // OEM bulundu, aynı OEM'e sahip tüm ürünleri getir
                const oemCodes = [...new Set(oemProducts.map(p => p.oem))];
                console.log('Bulunan OEM kodları:', oemCodes);
                allProducts = await Product.find({
                    oem: { $in: oemCodes },
                    company: req.user.company
                }).populate('category brand', 'name').lean();
                console.log('OEM grubundaki toplam ürün:', allProducts.length);
                isOemGroupSearch = true;
            } else {
                // 2. OEM bulunamadı, manufacturerCode ile arama
                console.log('2️⃣ manufacturerCode araması başlıyor...', searchTerm);
                const manufacturerCodeProducts = await Product.find({
                    manufacturerCode: { $regex: searchTerm, $options: 'i' },
                    company: req.user.company
                }).populate('category brand', 'name').lean();

                console.log('manufacturerCode sonuçları:', manufacturerCodeProducts.length);
                if (manufacturerCodeProducts.length > 0) {
                    // ManufacturerCode bulundu, aynı OEM'e sahip tüm ürünleri getir
                    const oemCodes = [...new Set(manufacturerCodeProducts.map(p => p.oem))];
                    allProducts = await Product.find({
                        oem: { $in: oemCodes },
                        company: req.user.company
                    }).populate('category brand', 'name').lean();
                    isOemGroupSearch = true;
                } else {
                    // 3. OEM ve manufacturerCode bulunamadı, ürün adı, SKU, marka ile kısmi arama
                    let filter = {
                        company: req.user.company,
                        $or: [
                            { name: { $regex: searchTerm, $options: 'i' } },
                            { sku: { $regex: searchTerm, $options: 'i' } },
                            { manufacturer: { $regex: searchTerm, $options: 'i' } },
                            { barcode: { $regex: searchTerm, $options: 'i' } },
                            { tags: { $in: [new RegExp(searchTerm, 'i')] } }
                        ]
                    };

                    // Ek filtreler
                    if (minStock) filter.quantity = { ...filter.quantity, $gte: Number(minStock) };
                    if (maxStock) filter.quantity = { ...filter.quantity, $lte: Number(maxStock) };

                    allProducts = await Product.find(filter).populate('category brand', 'name').lean();
                }
            }
        } else {
            // q yoksa veya boşsa ama filtreler varsa
            let filter = { company: req.user.company };
            if (minStock) filter.quantity = { ...filter.quantity, $gte: Number(minStock) };
            if (maxStock) filter.quantity = { ...filter.quantity, $lte: Number(maxStock) };

            // Eğer q yoksa ve başka hiçbir filtre de yoksa boş dönmemek için tüm ürünleri de getirebiliriz
            if (Object.keys(filter).length > 1) {
                allProducts = await Product.find(filter).populate('category brand', 'name').lean();
            }
        }

        // Sıralama
        if (sort && allProducts.length > 0) {
            const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
            const sortOrder = sort.startsWith('-') ? -1 : 1;
            allProducts.sort((a, b) => {
                if (a[sortField] < b[sortField]) return -1 * sortOrder;
                if (a[sortField] > b[sortField]) return 1 * sortOrder;
                return 0;
            });
        }

        // OEM gruplarına göre sonuçları hazırla
        const groupedResults = isOemGroupSearch ? groupProductsByOem(allProducts) : [];
        
        res.json({
            success: true,
            products: allProducts,
            groupedResults,
            totalResults: allProducts.length,
            searchTerm,
            isOemGroupSearch
        });

    } catch (err) {
        console.error('Arama hatası:', err.message);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// Ürünleri OEM'e göre gruplandır
function groupProductsByOem(products) {
    const grouped = products.reduce((acc, product) => {
        const oem = product.oem || 'N/A';
        if (!acc[oem]) {
            acc[oem] = {
                oem,
                products: [],
                manufacturers: new Set(),
                priceRange: { min: Infinity, max: -Infinity }
            };
        }
        
        acc[oem].products.push(product);
        if (product.manufacturer) {
            acc[oem].manufacturers.add(product.manufacturer);
        }
        
        if (product.salePrice && product.salePrice < acc[oem].priceRange.min) {
            acc[oem].priceRange.min = product.salePrice;
        }
        if (product.salePrice && product.salePrice > acc[oem].priceRange.max) {
            acc[oem].priceRange.max = product.salePrice;
        }
        
        return acc;
    }, {});

    // Set'leri array'e çevir ve sırala
    return Object.values(grouped).map(group => ({
        ...group,
        manufacturers: Array.from(group.manufacturers),
        productCount: group.products.length,
        priceRange: group.priceRange.min === Infinity ? { min: 0, max: 0 } : group.priceRange
    })).sort((a, b) => b.productCount - a.productCount);
}

// Hızlı arama önerileri için autocomplete endpoint
router.get('/products/suggestions', auth, async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.trim().length < 2) {
            return res.json({ success: true, suggestions: [] });
        }

        const searchTerm = q.trim();
        
        // OEM kodları, üretici kodları ve ürün adlarından öneriler getir
        const suggestions = await Product.aggregate([
            {
                $match: {
                    company: req.user.company,
                    $or: [
                        { oem: { $regex: searchTerm, $options: 'i' } },
                        { manufacturerCode: { $regex: searchTerm, $options: 'i' } },
                        { name: { $regex: searchTerm, $options: 'i' } },
                        { sku: { $regex: searchTerm, $options: 'i' } }
                    ]
                }
            },
            {
                $group: {
                    _id: null,
                    oems: { $addToSet: '$oem' },
                    codes: { $addToSet: '$manufacturerCode' },
                    names: { $addToSet: '$name' },
                    skus: { $addToSet: '$sku' }
                }
            }
        ]);

        const allSuggestions = [];
        if (suggestions.length > 0) {
            const { oems, codes, names, skus } = suggestions[0];
            
            // Arama terimiyle eşleşen önerileri filtrele
            oems.forEach(oem => {
                if (oem && oem.toLowerCase().includes(searchTerm.toLowerCase())) {
                    allSuggestions.push({ type: 'oem', value: oem, label: `OEM: ${oem}` });
                }
            });
            
            codes.forEach(code => {
                if (code && code.toLowerCase().includes(searchTerm.toLowerCase())) {
                    allSuggestions.push({ type: 'code', value: code, label: `Kod: ${code}` });
                }
            });
            
            names.forEach(name => {
                if (name && name.toLowerCase().includes(searchTerm.toLowerCase())) {
                    allSuggestions.push({ type: 'name', value: name, label: `Ürün: ${name}` });
                }
            });

            skus.forEach(sku => {
                if (sku && sku.toLowerCase().includes(searchTerm.toLowerCase())) {
                    allSuggestions.push({ type: 'sku', value: sku, label: `SKU: ${sku}` });
                }
            });
        }

        // En fazla 8 öneri döndür
        res.json({
            success: true,
            suggestions: allSuggestions.slice(0, 8)
        });

    } catch (error) {
        console.error('Öneri hatası:', error);
        res.status(500).json({
            success: false,
            error: 'Öneri getirme sırasında bir hata oluştu'
        });
    }
});

module.exports = router;
