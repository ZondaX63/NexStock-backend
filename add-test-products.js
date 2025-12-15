const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB bağlantısı
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stok-takip');

const Product = require('./models/Product');

async function addTestProducts() {
    try {
        // İlk olarak bir company ID'si alalım
        const existingProduct = await Product.findOne();
        if (!existingProduct) {
            console.log('Mevcut ürün bulunamadı. Önce normal yoldan bir ürün ekleyin.');
            return;
        }
        
        const companyId = existingProduct.company;
        
        // Test ürünleri - Aynı OEM'e sahip farklı markalar
        const testProducts = [
            {
                name: 'Fren Balatası BMW',
                sku: 'FB-BMW-001',
                oem: '34116794300',
                manufacturerCode: 'BMW-34116794300',
                manufacturer: 'BMW',
                salePrice: 2500,
                quantity: 15,
                company: companyId,
                description: 'BMW orijinal fren balatası',
                unit: 'Takım'
            },
            {
                name: 'Fren Balatası FEBI',
                sku: 'FB-FEBI-001',
                oem: '34116794300',
                manufacturerCode: 'FEBI-16794',
                manufacturer: 'FEBI',
                salePrice: 1850,
                quantity: 25,
                company: companyId,
                description: 'FEBI muadil fren balatası',
                unit: 'Takım'
            },
            {
                name: 'Fren Balatası 4U',
                sku: 'FB-4U-001',
                oem: '34116794300',
                manufacturerCode: '4U-9999',
                manufacturer: '4U',
                salePrice: 1200,
                quantity: 30,
                company: companyId,
                description: '4U aftermarket fren balatası',
                unit: 'Takım'
            },
            {
                name: 'Yağ Filtresi MANN',
                sku: 'YF-MANN-001',
                oem: '11427566327',
                manufacturerCode: 'MANN-HU816X',
                manufacturer: 'MANN',
                salePrice: 185,
                quantity: 50,
                company: companyId,
                description: 'MANN orijinal yağ filtresi',
                unit: 'Adet'
            },
            {
                name: 'Yağ Filtresi BOSCH',
                sku: 'YF-BOSCH-001',
                oem: '11427566327',
                manufacturerCode: 'BOSCH-F026407124',
                manufacturer: 'BOSCH',
                salePrice: 165,
                quantity: 40,
                company: companyId,
                description: 'BOSCH muadil yağ filtresi',
                unit: 'Adet'
            }
        ];
        
        // Var olan test ürünlerini sil
        await Product.deleteMany({
            company: companyId,
            sku: { $in: testProducts.map(p => p.sku) }
        });
        
        // Yeni test ürünlerini ekle
        await Product.insertMany(testProducts);
        
        console.log('✅ Test ürünleri başarıyla eklendi:');
        testProducts.forEach(p => {
            console.log(`   - ${p.name} (OEM: ${p.oem}, Kod: ${p.manufacturerCode})`);
        });
        
        console.log('\n🔍 Test arama örnekleri:');
        console.log('   - "34116794300" -> 3 fren balatası bulur (BMW, FEBI, 4U)');
        console.log('   - "4U-9999" -> 4U ürünü + diğer OEM eşleşmeleri');
        console.log('   - "11427566327" -> 2 yağ filtresi bulur (MANN, BOSCH)');
        console.log('   - "BOSCH-F026407124" -> BOSCH + aynı OEM\'deki MANN');
        
    } catch (error) {
        console.error('❌ Test ürünleri eklenirken hata:', error);
    } finally {
        mongoose.connection.close();
    }
}

addTestProducts();
