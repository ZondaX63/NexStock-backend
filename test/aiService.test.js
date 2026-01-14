const { GoogleGenerativeAI } = require("@google/generative-ai");

// Create mock functions accessible to tests
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn();

// Mock the library using factory
jest.mock("@google/generative-ai", () => {
    return {
        GoogleGenerativeAI: jest.fn().mockImplementation(() => {
            return {
                getGenerativeModel: mockGetGenerativeModel
            };
        })
    };
});

// Import service AFTER mock definition
const aiService = require('../services/aiService');

describe('AI Service Fallback Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default behavior so getGenerativeModel returns an object with generateContent
        mockGetGenerativeModel.mockReturnValue({
            generateContent: mockGenerateContent
        });
    });

    test('generateText should return response from first model if successful', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => "Success!" }
        });

        const result = await aiService.generateText("prompt");
        expect(result.text()).toBe("Success!");

        expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-flash-latest' });
    });

    test('generateText should explicitly check multiple models on failure', async () => {
        // First call fails, Second call succeeds
        mockGenerateContent
            .mockRejectedValueOnce(new Error('Model 1 Failed'))
            .mockResolvedValueOnce({
                response: { text: () => "Model 2 Success" }
            });

        const result = await aiService.generateText("prompt");
        expect(result.text()).toBe("Model 2 Success");
        expect(mockGetGenerativeModel).toHaveBeenCalledTimes(2);
        expect(mockGetGenerativeModel).toHaveBeenNthCalledWith(1, { model: 'gemini-flash-latest' });
        expect(mockGetGenerativeModel).toHaveBeenNthCalledWith(2, { model: 'gemini-1.5-flash' });
    });

    test('generateText should throw error if ALL models fail', async () => {
        mockGenerateContent.mockRejectedValue(new Error('Fail'));

        await expect(aiService.generateText("prompt")).rejects.toThrow('All AI models failed');
        expect(mockGetGenerativeModel).toHaveBeenCalledTimes(3);
    });
});
