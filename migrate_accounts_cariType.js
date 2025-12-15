const mongoose = require('mongoose');
const Account = require('./models/Account');
const Customer = require('./models/Customer');
const Supplier = require('./models/Supplier');

const MONGO_URI = 'mongodb://localhost:27017/YOUR_DB_NAME'; // <-- Burayı kendi veritabanı URI'nız ile değiştirin

async function migrate() {
  await mongoose.connect(MONGO_URI);
  const accounts = await Account.find({ type: 'cari', $or: [ { cariType: { $exists: false } }, { cariType: null } ] });
  let updated = 0;
  for (const acc of accounts) {
    // Önce müşteri olarak eşleştir
    const customer = await Customer.findOne({ name: acc.name, company: acc.company });
    if (customer) {
      acc.cariType = 'customer';
      acc.partnerId = customer._id;
      await acc.save();
      updated++;
      continue;
    }
    // Sonra tedarikçi olarak eşleştir
    const supplier = await Supplier.findOne({ name: acc.name, company: acc.company });
    if (supplier) {
      acc.cariType = 'supplier';
      acc.partnerId = supplier._id;
      await acc.save();
      updated++;
      continue;
    }
    // Eşleşme yoksa cariType null bırak
    acc.cariType = null;
    acc.partnerId = null;
    await acc.save();
  }
  console.log(`Güncellenen hesap sayısı: ${updated}`);
  await mongoose.disconnect();
}

migrate().catch(e => { console.error(e); process.exit(1); }); 