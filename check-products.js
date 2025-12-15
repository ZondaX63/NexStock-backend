const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stok-takip');

const Product = require('./models/Product');

async function checkProducts() {
  try {
    const products = await Product.find({}).select('name sku oem manufacturerCode manufacturer').limit(10);
    console.log('Mevcut ürünler:');
    products.forEach(p => {
      console.log(`  - ${p.name}: OEM=${p.oem || 'BOŞ'}, Code=${p.manufacturerCode || 'BOŞ'}, Manufacturer=${p.manufacturer || 'BOŞ'}`);
    });

    console.log(`\nToplam ürün sayısı: ${await Product.countDocuments()}`);

    // OEM alanı dolu olan ürünleri say
    const withOem = await Product.countDocuments({ oem: { $exists: true, $ne: '' } });
    console.log(`OEM alanı dolu ürünler: ${withOem}`);

    // manufacturerCode alanı dolu olan ürünleri say
    const withCode = await Product.countDocuments({ manufacturerCode: { $exists: true, $ne: '' } });
    console.log(`manufacturerCode alanı dolu ürünler: ${withCode}`);

  } catch (error) {
    console.error('Hata:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkProducts();
