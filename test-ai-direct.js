const { generateText } = require('./services/aiService');
require('dotenv').config();

async function testAI() {
    console.log('Testing Gemini connection...');
    try {
        const response = await generateText('Merhaba, sen kimsin? Sadece bir cümle cevap ver.');
        console.log('AI Response:', response.text());
        console.log('SUCCESS: Gemini connection working.');
    } catch (err) {
        console.error('FAILED: Gemini connection error:', err.message);
        if (err.message.includes('API_KEY_INVALID')) {
            console.error('Detail: API Key is invalid.');
        } else if (err.message.includes('Safety')) {
            console.error('Detail: Content filtered by safety settings.');
        }
    }
}

testAI();
