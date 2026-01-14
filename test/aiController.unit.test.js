/* eslint-disable no-undef */
const aiController = require('../controllers/aiController');
const aiService = require('../services/aiService');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const mongoose = require('mongoose');

// Mocks
jest.mock('../services/aiService');
jest.mock('../models/Product');
jest.mock('../models/Invoice');

describe('AI Controller Unit Tests', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();

        // Silence logs
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });

        req = {
            body: {},
            user: {
                company: new mongoose.Types.ObjectId().toString(), // Pass as string
                id: 'userid'
            }
        };

        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
    });

    describe('chatWithData', () => {
        it('should return 401 if user company is missing', async () => {
            req.user = {};
            await aiController.chatWithData(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should return 400 if message is missing', async () => {
            await aiController.chatWithData(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 200 and reply on success', async () => {
            req.body = { message: "Hello" };

            // Mock DB calls
            const mockProductQuery = {
                select: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue([{ name: "P1", quantity: 5 }])
                })
            };
            Product.find.mockReturnValue(mockProductQuery);
            Invoice.aggregate.mockResolvedValue([{ total: 1000, count: 5 }]);

            // Mock AI
            aiService.generateText.mockResolvedValue({ text: () => "AI Reply" });

            await aiController.chatWithData(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ reply: "AI Reply" });

            // Verify DB calls were made with correct company ID (ObjectId)
            // Product.find takes an object argument
            const findArg = Product.find.mock.calls[0][0];
            expect(findArg.company).toBeInstanceOf(mongoose.Types.ObjectId);
            expect(findArg.trackStock).toBe(true);
        });

        it('should handle service errors (500)', async () => {
            req.body = { message: "Hello" };

            Product.find.mockImplementation(() => { throw new Error("DB Error"); });

            await aiController.chatWithData(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Error processing chat'
            }));
        });
    });
});
