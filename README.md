# 📦 NexStock Backend

NexStock projesinin Node.js tabanlı API servisidir.

## 🛠️ Teknolojiler
- **Node.js & Express**
- **MongoDB & Mongoose**
- **JWT** (Kimlik doğrulama)
- **Google Gemini AI** (Yapay zeka özellikleri)

## ⚙️ Kurulum ve Çalıştırma

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

2. `.env` dosyasını yapılandırın:
   ```env
   PORT=5000
   MONGO_URI=your_mongodb_uri
   JWT_SECRET=your_secret_key
   GEMINI_API_KEY=your_gemini_key
   ```

3. Geliştirme modunda başlatın:
   ```bash
   npm run dev
   ```

## 🚀 Render Deployment
Bu repo Render'da **Web Service** olarak deploy edilmek üzere yapılandırılmıştır (`render.yaml`).
- **Build Command**: `npm install`
- **Start Command**: `node index.js`

## 🔐 İlk Yönetici Oluşturma
Sisteme ilk girişi yapabilmek için:
```bash
node create-admin.js
```
Varsayılan: `admin@example.com` / `admin123`
