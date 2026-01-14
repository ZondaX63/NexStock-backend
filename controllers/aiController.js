const { generateText, generateMultimodal } = require('../services/aiService');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');

exports.getDashboardInsights = async (req, res) => {
    try {
        // Ensure company is an ObjectId for aggregation
        const companyId = new mongoose.Types.ObjectId(req.user.company);

        // Date for context (Last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Fetch data for AI context
        const criticalStocks = await Product.find({
            company: companyId,
            trackStock: true,
            $expr: { $lte: ["$quantity", "$criticalStockLevel"] }
        }).select('name quantity criticalStockLevel');

        const sales = await Invoice.aggregate([
            { $match: { company: companyId, type: 'sale', date: { $gte: thirtyDaysAgo } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
        ]);

        const topProducts = await Invoice.aggregate([
            { $match: { company: companyId, type: 'sale', date: { $gte: thirtyDaysAgo } } },
            { $unwind: '$products' },
            { $group: { _id: '$products.product', totalSold: { $sum: '$products.quantity' } } },
            { $sort: { totalSold: -1 } },
            { $limit: 3 },
            { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'info' } },
            { $unwind: '$info' },
            { $project: { name: '$info.name', totalSold: 1 } }
        ]);

        const context = {
            lowStockItems: criticalStocks.map(s => `${s.name} (Kalan: ${s.quantity}, Kritik: ${s.criticalStockLevel})`),
            monthlySales: sales[0]?.total || 0,
            saleCount: sales[0]?.count || 0,
            bestSellers: topProducts.map(p => `${p.name} (${p.totalSold} adet)`)
        };

        const prompt = `
            Sen profesyonel bir işletme danışmanısın. Bir KOBİ'nin stok ve satış verilerini aşağıda veriyorum. 
            Lütfen bu verileri analiz et ve işletme sahibine Türkçe olarak kısa, öz ve aksiyon odaklı bir "Yapay Zeka Analiz Raporu" sun. 
            Rapor şunları içermeli:
            1. Genel durum özeti.
            2. Kritik stok uyarıları ve öneriler.
            3. Satış performansı hakkında yorum.
            4. Gelecek için 1-2 stratejik tavsiye.

            VERİLER:
            - Kritik Stoktaki Ürünler: ${context.lowStockItems.join(', ') || 'Yok'}
            - Son 30 Günlük Toplam Satış: ${context.monthlySales} TL (${context.saleCount} fatura)
            - En Çok Satan Ürünler: ${context.bestSellers.join(', ') || 'Veri yok'}

            Lütfen profesyonel ama samimi bir ton kullan. Raporu markdown formatında ver.
        `;

        const response = await generateText(prompt);
        const text = response.text();

        res.status(200).json({ insight: text });
    } catch (error) {
        console.error('AI Insight Error:', error);
        res.status(500).json({ message: 'Error generating AI insights', error: error.message });
    }
};

exports.chatWithData = async (req, res) => {
    try {
        const { message } = req.body;

        // Defensive check for user company
        if (!req.user || !req.user.company) {
            console.error('[AI Chat] User or company missing in request.');
            return res.status(401).json({ message: 'User company information not found' });
        }

        // Ensure company is an ObjectId for aggregation
        const companyId = new mongoose.Types.ObjectId(req.user.company);

        if (!message) return res.status(400).json({ message: 'Message is required' });

        // Fetch succinct context
        // 1. Critical Stock
        const criticalStocks = await Product.find({
            company: companyId,
            trackStock: true,
            $expr: { $lte: ["$quantity", "$criticalStockLevel"] }
        }).select('name quantity').limit(10);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [salesStats, topProducts, totalProducts] = await Promise.all([
            Invoice.aggregate([
                { $match: { company: companyId, type: 'sale', date: { $gte: thirtyDaysAgo } } },
                { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
            ]),
            Invoice.aggregate([
                { $match: { company: companyId, type: 'sale', date: { $gte: thirtyDaysAgo } } },
                { $unwind: '$products' },
                { $group: { _id: '$products.product', totalSold: { $sum: '$products.quantity' } } },
                { $sort: { totalSold: -1 } },
                { $limit: 5 },
                { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'info' } },
                { $unwind: '$info' },
                { $project: { name: '$info.name', totalSold: 1 } }
            ]),
            Product.countDocuments({ company: companyId })
        ]);

        const context = `
            BUGÜNÜN TARİHİ: ${new Date().toLocaleDateString('tr-TR')}
            
            İŞLETME VERİLERİ (SON 30 GÜN):
            - Toplam Ürün Çeşidi: ${totalProducts}
            - Kritik Stoktaki Ürünler (${criticalStocks.length} adet): ${criticalStocks.map(s => `${s.name} (${s.quantity})`).join(', ') || 'Bulunmuyor'}
            - Toplam Satış Cirosu: ${salesStats[0]?.total || 0} TL
            - Toplam Satış İşlemi: ${salesStats[0]?.count || 0} adet
            - En Çok Satan Ürünler: ${topProducts.map(p => `${p.name} (${p.totalSold} adet)`).join(', ') || 'Veri yok'}
        `;

        const prompt = `
            Sen "NexStock Asistan" adında yardımsever ve zeki bir iş analistisin. 
            İşletme sahibi sana şu soruyu sordu: "${message}"

            İşletmenin anlık durumu hakkında bilgiler:
            ${context}

            Bu verileri kullanarak soruya kısa, net ve faydalı bir cevap ver. 
            Eğer soru verilerle ilgili değilse genel bir işletme asistanı gibi cevapla.
            Samimi ama profesyonel ol.
        `;

        const response = await generateText(prompt);
        res.status(200).json({ reply: response.text() });
    } catch (error) {
        // Log to file for visibility
        const fs = require('fs');
        const logMsg = `[${new Date().toISOString()}] AI Chat Error: ${error.stack || error}\n`;
        fs.appendFileSync('backend-error.log', logMsg);

        console.error('[AI Chat] CRITICAL ERROR:', error);
        res.status(500).json({
            message: 'Error processing chat',
            error: error.message,
            stack: error.stack
        });
    }
};

exports.generateDescription = async (req, res) => {
    try {
        const { name, categoryName } = req.body;
        if (!name) return res.status(400).json({ message: 'Product name is required' });

        const prompt = `
            Ürün Adı: ${name}
            Kategori: ${categoryName || 'Belirtilmedi'}

            Yukarıdaki bilgilere dayanarak bu ürün için profesyonel, ilgi çekici ve bilgilendirici bir ürün açıklaması yaz. 
            Açıklama 2-3 cümleden oluşmalı ve müşteriyi satın almaya teşvik etmeli. 
            Sadece açıklama metnini döndür. Türkçe olsun.
        `;

        const response = await generateText(prompt);
        res.status(200).json({ description: response.text() });
    } catch (error) {
        console.error('Description Gen Error:', error);
        res.status(500).json({ message: 'Error generating description', error: error.message });
    }
};

exports.generateEmail = async (req, res) => {
    try {
        const { type, partnerName, items, totalAmount, currency } = req.body;

        const prompt = `
            Aşağıdaki bilgilere göre ${type === 'offer' ? 'teklif' : 'sipariş'} ile ilgili müşteriye/tedarikçiye gönderilecek profesyonel ve nazik bir e-posta taslağı yaz.
            
            Alıcı: ${partnerName}
            İşlem Tipi: ${type === 'offer' ? 'Satış Teklifi' : type === 'confirmation' ? 'Sipariş Onayı' : 'Fatura Gönderimi'}
            Ürünler: ${items ? items.map(i => i.name).join(', ') : 'Belirtilmemiş'}
            Toplam Tutar: ${totalAmount} ${currency}

            E-posta Konusu: ...
            E-posta İçeriği: ...
            
            Lütfen sadece konu ve içeriği düzgün bir formatta ver. JSON veya karmaşık yapı olmasın, doğrudan kopyalanıp yapıştırılabilecek bir metin olsun.
        `;

        const response = await generateText(prompt);
        res.status(200).json({ emailContent: response.text() });
    } catch (error) {
        console.error('Email Gen Error:', error);
        res.status(500).json({ message: 'Error generating email', error: error.message });
    }
};

exports.analyzeReceipt = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Lütfen bir fatura dosyası (Resim veya PDF) yükleyin.' });
        }

        // Prepare data for Gemini based on file type
        let contentPart;
        const mimeType = req.file.mimetype;

        if (mimeType === 'application/pdf') {
            contentPart = {
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: "application/pdf"
                }
            };
        } else if (mimeType.startsWith('image/')) {
            contentPart = {
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: mimeType
                }
            };
        } else {
            return res.status(400).json({ message: 'Desteklenmeyen dosya formatı. Sadece Resim ve PDF.' });
        }

        const prompt = `
            Bu bir fatura dökümanıdır (Görsel veya PDF). Lütfen bu dökümandaki verileri analiz et ve aşağıdaki JSON formatında döndür. 
            Eğer bir alanı bulamazsan boş bırak veya uygun bir varsayılan değer ver.
            Ürünlerle veritabanında eşleşme yapılabilmesi için ürün isimlerini net bir şekilde al.
            ÖNEMLİ: Sadece geçerli bir JSON objesi döndür, başka açıklama ekleme.

            JSON Yapısı:
            {
                "invoiceNumber": "Fatura Numarası (Varsa)",
                "partnerName": "Satıcı/Tedarikçi Adı",
                "date": "YYYY-MM-DD formatında tarih",
                "currency": "TRY, USD or EUR",
                "totalAmount": 123.45,
                "products": [
                    {
                        "name": "Ürün Adı",
                        "quantity": 1,
                        "price": 123.45
                    }
                ]
            }
        `;

        // Note: For gemini-flash-latest or gemini-1.5, PDF support is native.
        // If getting errors with PDF on specific legacy models, we might need a different approach,
        // but current setup (flash-latest) usually handles it.
        const response = await generateMultimodal(prompt, contentPart);
        let text = response.text();

        // Clean JSON from markdown if exists
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        const extractedData = JSON.parse(text);

        // --- ENHANCEMENT: Product Matching ---
        // Try to find matching products in DB for the extracted names
        if (extractedData.products && Array.isArray(extractedData.products)) {
            const companyId = new mongoose.Types.ObjectId(req.user.company);
            const userProducts = await Product.find({ company: companyId }).select('name _id');

            for (let p of extractedData.products) {
                // Simple case-insensitive match
                const match = userProducts.find(up =>
                    up.name.toLowerCase().includes(p.name.toLowerCase()) ||
                    p.name.toLowerCase().includes(up.name.toLowerCase())
                );
                if (match) {
                    p.productId = match._id;
                }
            }
        }
        // -------------------------------------

        res.status(200).json(extractedData);
    } catch (error) {
        console.error('Receipt Analysis Error:', error);
        res.status(500).json({ message: 'Belge taranırken bir hata oluştu.', error: error.message });
    }
};

exports.predictStock = async (req, res) => {
    try {
        const { productId } = req.params;
        const companyId = new mongoose.Types.ObjectId(req.user.company);

        const product = await Product.findOne({ _id: productId, company: companyId });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        // Get last 90 days of sales for this product
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const salesData = await Invoice.aggregate([
            {
                $match: {
                    company: companyId,
                    type: 'sale',
                    date: { $gte: ninetyDaysAgo },
                    'products.product': new mongoose.Types.ObjectId(productId)
                }
            },
            { $unwind: '$products' },
            { $match: { 'products.product': new mongoose.Types.ObjectId(productId) } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
                    totalQuantity: { $sum: '$products.quantity' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const prompt = `
            Ürün: ${product.name}
            Mevcut Stok: ${product.quantity} ${product.unit}
            Son 90 Günlük Satış Verileri (Aylık): ${JSON.stringify(salesData)}

            Bu verilere bakarak:
            1. Ürünün tahmini tükenme süresini hesapla.
            2. Gelecek ay için kaç adet sipariş verilmeli?
            3. Satış trendi hakkında kısa bir yorum yap.

            Lütfen cevapları Türkçe ve sadece 2-3 kısa madde halinde ver.
        `;

        const response = await generateText(prompt);
        res.status(200).json({ forecast: response.text() });
    } catch (error) {
        console.error('Stock Predict Error:', error);
        res.status(500).json({ message: 'Error predicting stock', error: error.message });
    }
};

exports.semanticSearch = async (req, res) => {
    try {
        const { query } = req.body;
        const company = req.user.company;

        if (!query) return res.status(400).json({ message: 'Query is required' });

        // Get all products for context (limit to recent 50 to avoid token overflow for now)
        const products = await Product.find({ company })
            .select('name category quantity unit')
            .limit(50);

        const context = products.map(p => `${p.name} (Kategori: ${p.category})`).join(', ');

        const prompt = `
            Kullanıcı stokta şu terimi arıyor: "${query}"
            Elimizdeki ürün listesi: ${context}

            Lütfen bu listeden kullanıcı aramasına en yakın veya ilgili olabilecek ilk 3 ürünü seç.
            Ürün isimlerini aralarında virgül olacak şekilde sadece isim olarak döndür. 
            Eğer hiçbir alaka kuramıyorsan "Bulunamadı" döndür.
        `;

        const response = await generateText(prompt);
        const suggestionText = response.text();

        if (suggestionText.includes('Bulunamadı')) {
            return res.status(200).json({ suggestions: [] });
        }

        const suggestions = suggestionText.split(',').map(s => s.trim());
        res.status(200).json({ suggestions });
    } catch (error) {
        console.error('Semantic Search Error:', error);
        res.status(500).json({ message: 'Error searching semantics', error: error.message });
    }
};
