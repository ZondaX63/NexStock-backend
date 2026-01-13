const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;

console.log("--- AI DEBUGGER STARTED ---");
console.log(`API Key Loaded: ${apiKey ? 'YES (Starts with ' + apiKey.substring(0, 4) + ')' : 'NO'}`);

async function testModel(modelName) {
    console.log(`\nTesting Model: ${modelName}`);
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        console.log(`Sending request to ${modelName}...`);
        const result = await model.generateContent("Hello, are you working?");
        const response = await result.response;
        console.log(`✅ SUCCESS: ${modelName} responded.`);
        console.log(`Response: ${response.text()}`);
        return true;
    } catch (error) {
        console.log(`❌ FAILED: ${modelName}`);
        console.log(`Error Message: ${error.message}`);
        // Log full error structure if possible
        if (error.response) {
            console.log("Error Response:", JSON.stringify(error.response, null, 2));
        }
        return false;
    }
}

async function runDiagnostics() {
    if (!apiKey) {
        console.error("⛔ FATAL: No API Key found in .env");
        return;
    }

    const modelsToTest = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-exp",
        "gemini-flash-latest",
        "gemini-pro-latest"
    ];

    let successCount = 0;
    for (const m of modelsToTest) {
        const success = await testModel(m);
        if (success) successCount++;
    }

    console.log("\n--- DIAGNOSTICS COMPLETE ---");
    console.log(`Working Models: ${successCount} / ${modelsToTest.length}`);
}

runDiagnostics();
