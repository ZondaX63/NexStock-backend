const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // For earlier versions of SDK, logic might differ, 
        // but usually there is a way to get model info or just test.
        // Since we can't easily access the model list method directly in all SDK versions clearly,
        // we'll just try to instantiate a model and run a simple prompt on a few common names.

        const candidates = [
            "gemini-pro",
            "gemini-1.5-flash-001",
            "gemini-1.5-pro-001",
            "gemini-1.0-pro-001"
        ];

        console.log("Testing models with API Key...");

        for (const modelName of candidates) {
            try {
                console.log(`Testing ${modelName}...`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Test.");
                const response = await result.response;
                console.log(`SUCCESS: ${modelName} responded: ${response.text()}`);
                return; // Found a working one
            } catch (error) {
                console.log(`FAILED: ${modelName} - ${error.message}`);
            }
        }
        console.log("No working models found.");

    } catch (error) {
        console.error("Script Error:", error);
    }
}

listModels();
