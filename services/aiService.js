const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not defined in environment variables!");
} else {
    console.log(`Gemini API Key loaded: ${apiKey.substring(0, 5)}...`);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Priority list of models to try
const MODELS = ["gemini-flash-latest", "gemini-1.5-flash", "gemini-pro"];

async function generateWithFallback(operationType, ...args) {
    let errors = [];
    const fs = require('fs'); // Import fs for logging

    for (const modelName of MODELS) {
        try {
            // console.log(`[AI Service] Attempting ${operationType} with model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent(...args);
            const response = await result.response;
            return response;
        } catch (error) {
            const errorMsg = `[AI Service] Model ${modelName} failed: ${error.message}`;
            console.warn(errorMsg);
            errors.push(errorMsg);

            // Log to file for visibility
            try {
                fs.appendFileSync('backend-error.log', `[${new Date().toISOString()}] ${errorMsg}\n`);
            } catch (e) { }
        }
    }

    const allErrors = errors.join(' || ');
    console.error(`[AI Service] All models failed. Details: ${allErrors}`);
    throw new Error(`All AI models failed. Details: ${allErrors}`);
}

module.exports = {
    genAI,
    // Wrapper for text-only requests
    generateText: async (prompt) => {
        return generateWithFallback('text', prompt);
    },
    // Wrapper for multimodal requests (images/pdfs)
    generateMultimodal: async (prompt, contentParts) => {
        // Gemini API expects [prompt, ...parts] or just [prompt, part]
        // contentParts is usually an object or array of objects
        const input = Array.isArray(contentParts) ? [prompt, ...contentParts] : [prompt, contentParts];
        return generateWithFallback('vision', input);
    }
};
