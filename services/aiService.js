const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Unified model for both text and vision
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

module.exports = {
    genAI,
    model
};
