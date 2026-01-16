const ExchangeRate = require('../models/ExchangeRate');

/**
 * Build aggregation pipeline for product listing with dynamic TRY price calculation
 * @param {Object} filters - { search, category, brand, minPrice, maxPrice }
 * @param {Object} sort - { field, order } e.g., { field: 'priceTRY', order: 1 }
 * @param {Object} pagination - { page, limit }
 * @returns {Array} Aggregation pipeline stages
 */
const buildProductListPipeline = async (filters = {}, sort = {}, pagination = {}) => {
    const pipeline = [];

    // Stage 1: Match filters (category, brand, company)
    const matchStage = {};

    if (filters.company) {
        matchStage.company = filters.company;
    }

    if (filters.category) {
        matchStage.category = filters.category;
    }

    if (filters.brand) {
        matchStage.brand = filters.brand;
    }

    // Text search
    if (filters.search) {
        matchStage.$or = [
            { name: { $regex: filters.search, $options: 'i' } },
            { sku: { $regex: filters.search, $options: 'i' } },
            { barcode: { $regex: filters.search, $options: 'i' } },
            { oem: { $regex: filters.search, $options: 'i' } }
        ];
    }

    if (Object.keys(matchStage).length > 0) {
        pipeline.push({ $match: matchStage });
    }

    // Stage 2: Lookup exchange rates
    pipeline.push({
        $lookup: {
            from: 'exchangerates',
            let: {
                saleCurr: { $ifNull: ['$saleCurrency', { $ifNull: ['$currency', 'TRY'] }] },
                purchaseCurr: { $ifNull: ['$purchaseCurrency', { $ifNull: ['$currency', 'TRY'] }] }
            },
            pipeline: [
                {
                    $match: {
                        $expr: {
                            $or: [
                                { $eq: ['$currency', '$$saleCurr'] },
                                { $eq: ['$currency', '$$purchaseCurr'] }
                            ]
                        }
                    }
                }
            ],
            as: 'rates'
        }
    });

    // Stage 3: Add computed fields (finalPriceTRY, finalPurchasePriceTRY)
    pipeline.push({
        $addFields: {
            // Use saleCurrency if exists, otherwise fallback to currency field
            effectiveSaleCurrency: { $ifNull: ['$saleCurrency', { $ifNull: ['$currency', 'TRY'] }] },
            effectivePurchaseCurrency: { $ifNull: ['$purchaseCurrency', { $ifNull: ['$currency', 'TRY'] }] }
        }
    });

    pipeline.push({
        $addFields: {
            saleRate: {
                $cond: {
                    if: { $eq: ['$effectiveSaleCurrency', 'TRY'] },
                    then: 1,
                    else: {
                        $let: {
                            vars: {
                                rateDoc: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: '$rates',
                                                cond: { $eq: ['$$this.currency', '$effectiveSaleCurrency'] }
                                            }
                                        },
                                        0
                                    ]
                                }
                            },
                            in: { $ifNull: ['$$rateDoc.rate', 1] }
                        }
                    }
                }
            },
            purchaseRate: {
                $cond: {
                    if: { $eq: ['$effectivePurchaseCurrency', 'TRY'] },
                    then: 1,
                    else: {
                        $let: {
                            vars: {
                                rateDoc: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: '$rates',
                                                cond: { $eq: ['$$this.currency', '$effectivePurchaseCurrency'] }
                                            }
                                        },
                                        0
                                    ]
                                }
                            },
                            in: { $ifNull: ['$$rateDoc.rate', 1] }
                        }
                    }
                }
            }
        }
    });

    pipeline.push({
        $addFields: {
            finalPriceTRY: { $multiply: [{ $ifNull: ['$salePrice', 0] }, '$saleRate'] },
            finalPurchasePriceTRY: { $multiply: [{ $ifNull: ['$purchasePrice', 0] }, '$purchaseRate'] }
        }
    });

    // Stage 4: Filter by price range (in TRY)
    if (filters.minPrice || filters.maxPrice) {
        const priceMatch = {};
        if (filters.minPrice) priceMatch.$gte = parseFloat(filters.minPrice);
        if (filters.maxPrice) priceMatch.$lte = parseFloat(filters.maxPrice);
        pipeline.push({ $match: { finalPriceTRY: priceMatch } });
    }

    // Stage 5: Populate category and brand
    pipeline.push(
        {
            $lookup: {
                from: 'categories',
                localField: 'category',
                foreignField: '_id',
                as: 'category'
            }
        },
        {
            $lookup: {
                from: 'brands',
                localField: 'brand',
                foreignField: '_id',
                as: 'brand'
            }
        },
        {
            $addFields: {
                category: { $arrayElemAt: ['$category', 0] },
                brand: { $arrayElemAt: ['$brand', 0] }
            }
        }
    );

    // Stage 6: Sort
    const sortField = sort.field || 'createdAt';
    const sortOrder = sort.order || -1;

    const sortStage = {};
    if (sortField === 'priceTRY') {
        sortStage.finalPriceTRY = sortOrder;
    } else {
        sortStage[sortField] = sortOrder;
    }
    pipeline.push({ $sort: sortStage });

    // Stage 7: Pagination
    if (pagination.limit && pagination.limit > 0) {
        const page = pagination.page || 1;
        const limit = pagination.limit;
        const skip = (page - 1) * limit;

        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });
    }

    // Clean up: Remove temporary fields
    pipeline.push({
        $project: {
            rates: 0,
            saleRate: 0,
            purchaseRate: 0,
            effectiveSaleCurrency: 0,
            effectivePurchaseCurrency: 0
        }
    });

    return pipeline;
};

/**
 * Get total count for pagination
 */
const getProductCount = async (filters = {}) => {
    const Product = require('../models/Product');

    const matchStage = {};

    if (filters.company) matchStage.company = filters.company;
    if (filters.category) matchStage.category = filters.category;
    if (filters.brand) matchStage.brand = filters.brand;

    if (filters.search) {
        matchStage.$or = [
            { name: { $regex: filters.search, $options: 'i' } },
            { sku: { $regex: filters.search, $options: 'i' } },
            { barcode: { $regex: filters.search, $options: 'i' } },
            { oem: { $regex: filters.search, $options: 'i' } }
        ];
    }

    return await Product.countDocuments(matchStage);
};

module.exports = {
    buildProductListPipeline,
    getProductCount
};
