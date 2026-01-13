const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not defined in environment variables!");
} else {
    console.log(`Gemini API Key loaded: ${apiKey.substring(0, 5)}...`);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Unified Strategy:
// Unified Strategy:
// gemini-flash-latest: The ONLY working model confirmed by diagnostics for this API Key (Free Tier).
// Others (gemini-2.0, gemini-pro) return 429 Quota Exceeded (Limit 0).
const textModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
const visionModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

module.exports = {
    genAI,
    textModel,
    visionModel
};
