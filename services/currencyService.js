const ExchangeRate = require('../models/ExchangeRate');

// Basit bir in-memory cache
let rateCache = {
    rates: null,
    lastUpdate: null
};

const CACHE_DURATION = 60 * 60 * 1000; // 1 saat (ms)

const saveRatesToDB = async (rates) => {
    try {
        // USD ve EUR kurlarını kaydet
        await ExchangeRate.findOneAndUpdate(
            { currency: 'USD' },
            { rate: parseFloat(rates.USD.rate), lastUpdated: new Date() },
            { upsert: true, new: true }
        );

        await ExchangeRate.findOneAndUpdate(
            { currency: 'EUR' },
            { rate: parseFloat(rates.EUR.rate), lastUpdated: new Date() },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error('Error saving rates to DB:', error.message);
    }
};

const getRatesFromDB = async () => {
    try {
        const rates = await ExchangeRate.find({}).lean();
        if (rates.length === 0) return null;

        const formattedRates = {};
        rates.forEach(r => {
            formattedRates[r.currency] = {
                code: r.currency,
                rate: r.rate.toFixed(4),
                symbol: r.currency === 'USD' ? '$' : '€'
            };
        });

        return {
            ...formattedRates,
            lastUpdate: rates[0].lastUpdated
        };
    } catch (error) {
        console.error('Error fetching rates from DB:', error.message);
        return null;
    }
};

const getExchangeRates = async () => {
    const now = new Date();

    // Cache geçerli mi kontrol et
    if (rateCache.rates && rateCache.lastUpdate && (now - rateCache.lastUpdate < CACHE_DURATION)) {
        return rateCache.rates;
    }

    try {
        // ExchangeRate-API (v4) - Kayıt gerektirmeyen güvenilir ve ücretsiz bir API
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();

        if (data && data.rates) {
            const usdTry = data.rates.TRY;
            const usdEur = data.rates.EUR;
            const eurTry = usdTry / usdEur;

            const fetchedRates = {
                USD: {
                    code: 'USD',
                    rate: usdTry.toFixed(4),
                    symbol: '$'
                },
                EUR: {
                    code: 'EUR',
                    rate: eurTry.toFixed(4),
                    symbol: '€'
                },
                lastUpdate: data.date
            };

            // Cache güncelle
            rateCache = {
                rates: fetchedRates,
                lastUpdate: now
            };

            // DB'ye kaydet (async, hata olsa bile devam et)
            saveRatesToDB(fetchedRates).catch(err =>
                console.error('Background save to DB failed:', err)
            );

            return fetchedRates;
        }
        throw new Error('Geçersiz veri formatı');
    } catch (error) {
        console.error('Döviz kuru çekme hatası:', error.message);

        // Önce cache'e bak
        if (rateCache.rates) return rateCache.rates;

        // Cache yoksa DB'den çek
        const dbRates = await getRatesFromDB();
        if (dbRates) {
            rateCache = { rates: dbRates, lastUpdate: now };
            return dbRates;
        }

        throw error;
    }
};

module.exports = {
    getExchangeRates,
    getRatesFromDB
};
