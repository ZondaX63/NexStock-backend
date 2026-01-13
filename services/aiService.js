const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Hybrid Strategy:
// gemini-pro: Better/Stable for text-only tasks
// gemini-1.5-flash: Needed for multimodal (vision) tasks
const textModel = genAI.getGenerativeModel({ model: "gemini-pro" });
const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

module.exports = {
    genAI,
    textModel,
    visionModel
};
