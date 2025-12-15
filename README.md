# StokTakip Server (Backend)

StokTakip, KOBİ'ler için geliştirilmiş kapsamlı bir stok, muhasebe ve cari yönetim uygulamasıdır. Bu repo, Node.js/Express ve MongoDB tabanlı backend (sunucu) kısmını içerir.

## Özellikler

- JWT tabanlı kimlik doğrulama
- Kullanıcı, müşteri, tedarikçi, ürün, fatura, hareket, log ve rapor yönetimi
- Kasa ve finansal işlemler
- Gelişmiş loglama ve bildirim sistemi
- Filtrelenebilir ve özelleştirilebilir raporlar
- RESTful API mimarisi
- CRUD işlemleri

## Kullanılan Teknolojiler

- Node.js & Express.js
- MongoDB & Mongoose
- JWT (JSON Web Token)
- dotenv, cors, morgan, bcryptjs, vs.

## Kurulum

1. Ana dizinde `StokTakip-server` klasörüne girin:
   ```sh
   cd StokTakip-server
   ```
2. Bağımlılıkları yükleyin:
   ```sh
   npm install
   ```
3. `.env` dosyanızı oluşturun (örnek için `.env.example`):
   ```sh
   cp .env.example .env
   ```
4. Sunucuyu başlatın:
   ```sh
   npm run dev
   ```
   Sunucu varsayılan olarak [http://localhost:5000](http://localhost:5000) adresinde çalışır.

## Ana Komutlar

- `npm run dev` – Geliştirme modunda başlatır (nodemon)
- `npm start` – Üretim modunda başlatır
- `npm test` – Testleri çalıştırır

## Klasör Yapısı

```
StokTakip-server/
  config/         # Veritabanı ve genel ayarlar
  middleware/     # Orta katmanlar (auth, log, vs.)
  models/         # Mongoose veri modelleri
  routes/         # API endpointleri
  test/           # Otomatik testler
  server.js       # Ana sunucu dosyası
```

## Temel API Endpointleri

- `/api/auth` – Kayıt, giriş, kullanıcı işlemleri
- `/api/products` – Ürün CRUD
- `/api/customers` – Müşteri CRUD
- `/api/suppliers` – Tedarikçi CRUD
- `/api/invoices` – Fatura CRUD
- `/api/accounts` – Hesap kartları
- `/api/movements` – Stok ve finansal hareketler
- `/api/reports` – Raporlama
- `/api/logs` – Loglama

> Tüm endpointler ve detaylar için `routes/` klasörünü inceleyin.

## Veri Modelleri

Başlıca modeller: User, Product, Customer, Supplier, Invoice, Account, StockMovement, Log, Notification, Settings, vs. (bkz. `models/`)

## Geliştirici Notları

- Tüm hassas bilgiler `.env` dosyasında tutulur.
- API güvenliği için JWT ve auth middleware kullanılır.
- Testler için `test/` klasörüne bakınız.

## Katkı Sağlama

Katkıda bulunmak için lütfen bir fork oluşturun, değişikliklerinizi ayrı bir branch'te yapın ve pull request gönderin.

## Sıkça Sorulan Sorular (SSS)

**S: Hangi MongoDB sürümü ile uyumlu?**
C: 4.x ve üzeri ile test edilmiştir.

**S: API dökümantasyonu var mı?**
C: Şu an için kod ve route dosyalarını inceleyebilirsiniz.

## Lisans

MIT
