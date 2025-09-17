"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productsRouter = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const DatabaseService_1 = require("../services/DatabaseService");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
exports.productsRouter = router;
class ProductCache {
    constructor() {
        this.cache = new Map();
        this.DEFAULT_TTL = 5 * 60 * 1000;
        this.SEARCH_TTL = 2 * 60 * 1000;
        this.CATEGORIES_TTL = 10 * 60 * 1000;
    }
    set(key, data, ttl = this.DEFAULT_TTL) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            expiry: Date.now() + ttl
        });
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item || Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        return item.data;
    }
    invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }
    clear() {
        this.cache.clear();
    }
    getStats() {
        return { size: this.cache.size };
    }
    invalidateProduct(id) {
        if (id) {
            this.cache.delete(`product:${id}`);
        }
        this.invalidatePattern('products:.*');
        this.invalidatePattern('search:.*');
        this.cache.delete('categories');
    }
    getCacheKey(prefix, params) {
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${key}=${params[key]}`)
            .join('&');
        return `${prefix}:${sortedParams}`;
    }
}
const productCache = new ProductCache();
function handleValidationErrors(req, res, next) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const validationErrors = errors.array().map(error => ({
            field: error.type === 'field' ? error.path : error.type,
            message: error.msg,
            value: error.type === 'field' ? error.value : undefined
        }));
        const response = {
            success: false,
            error: 'Validation failed',
            message: 'Please check your input data',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        return res.status(400).json({
            ...response,
            validation_errors: validationErrors
        });
    }
    next();
}
function buildSearchQuery(searchTerm, filters) {
    const conditions = ['is_active = true'];
    const params = [];
    let paramIndex = 1;
    if (searchTerm) {
        conditions.push(`(
      search_vector @@ plainto_tsquery('english', $${paramIndex++}) OR
      name_simple ILIKE $${paramIndex++} OR
      description_simple ILIKE $${paramIndex++}
    )`);
        params.push(searchTerm, `%${searchTerm.toLowerCase()}%`, `%${searchTerm.toLowerCase()}%`);
    }
    if (filters.category) {
        conditions.push(`category = $${paramIndex++}`);
        params.push(filters.category);
    }
    if (filters.brand) {
        conditions.push(`brand ILIKE $${paramIndex++}`);
        params.push(`%${filters.brand}%`);
    }
    if (filters.price_min !== undefined) {
        conditions.push(`price >= $${paramIndex++}`);
        params.push(filters.price_min);
    }
    if (filters.price_max !== undefined) {
        conditions.push(`price <= $${paramIndex++}`);
        params.push(filters.price_max);
    }
    if (filters.in_stock !== undefined) {
        conditions.push(`in_stock = $${paramIndex++}`);
        params.push(filters.in_stock);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    let selectClause = '*';
    let orderClause = 'ORDER BY sort_order, name';
    if (searchTerm) {
        selectClause = `*, 
      CASE 
        WHEN name_simple ILIKE $2 THEN 100
        WHEN name_simple ILIKE $3 THEN 90
        ELSE ts_rank(search_vector, plainto_tsquery('english', $1)) * 10
      END as search_rank,
      CASE
        WHEN name_simple ILIKE $2 THEN 'exact'
        WHEN name_simple ILIKE $3 THEN 'fuzzy'  
        ELSE 'partial'
      END as match_type`;
        orderClause = 'ORDER BY search_rank DESC, sort_order, name';
    }
    const query = `SELECT ${selectClause} FROM products ${whereClause} ${orderClause}`;
    return { query, params, paramIndex };
}
async function fuzzySearchProducts(searchTerm, category, limit = 10) {
    const cacheKey = `fuzzy:${searchTerm}:${category || 'all'}:${limit}`;
    const cached = productCache.get(cacheKey);
    if (cached)
        return cached;
    const conditions = ['is_active = true'];
    const params = [searchTerm];
    let paramIndex = 2;
    if (category) {
        conditions.push(`category = $${paramIndex++}`);
        params.push(category);
    }
    const query = `
    SELECT *,
      GREATEST(
        similarity(name, $1),
        similarity(COALESCE(brand || ' ' || model, brand, model, ''), $1),
        similarity(COALESCE(description, ''), $1)
      ) as search_rank,
      'fuzzy' as match_type
    FROM products 
    WHERE ${conditions.join(' AND ')}
    AND (
      similarity(name, $1) > 0.3 OR
      similarity(COALESCE(brand || ' ' || model, brand, model, ''), $1) > 0.3 OR
      similarity(COALESCE(description, ''), $1) > 0.2
    )
    ORDER BY search_rank DESC
    LIMIT $${paramIndex}
  `;
    const searchResult = await DatabaseService_1.databaseService.searchProducts(searchTerm, { category }, 'relevance', limit, 0);
    if (searchResult.error) {
        throw new Error(searchResult.error.message);
    }
    const results = searchResult.data || [];
    productCache.set(cacheKey, results, productCache['SEARCH_TTL']);
    return results;
}
const createProductValidation = [
    (0, express_validator_1.body)('name').isString().isLength({ min: 1, max: 255 }).withMessage('Product name is required'),
    (0, express_validator_1.body)('category').isIn(['cameras', 'recorders', 'storage', 'network', 'power', 'accessories']).withMessage('Valid category is required'),
    (0, express_validator_1.body)('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
    (0, express_validator_1.body)('cost').optional().isFloat({ min: 0 }).withMessage('Cost must be positive'),
    (0, express_validator_1.body)('sku').optional().isString().isLength({ min: 3, max: 50 }).withMessage('SKU must be 3-50 characters'),
    (0, express_validator_1.body)('brand').optional().isString().isLength({ max: 100 }),
    (0, express_validator_1.body)('model').optional().isString().isLength({ max: 100 }),
    (0, express_validator_1.body)('specifications').optional().isArray().withMessage('Specifications must be an array'),
    handleValidationErrors
];
const updateProductValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Valid product ID is required'),
    (0, express_validator_1.body)('name').optional().isString().isLength({ min: 1, max: 255 }),
    (0, express_validator_1.body)('category').optional().isIn(['cameras', 'recorders', 'storage', 'network', 'power', 'accessories']),
    (0, express_validator_1.body)('price').optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('cost').optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('in_stock').optional().isBoolean(),
    (0, express_validator_1.body)('is_active').optional().isBoolean(),
    handleValidationErrors
];
const searchProductsValidation = [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }),
    (0, express_validator_1.query)('category').optional().isIn(['cameras', 'recorders', 'storage', 'network', 'power', 'accessories']),
    (0, express_validator_1.query)('price_min').optional().isFloat({ min: 0 }),
    (0, express_validator_1.query)('price_max').optional().isFloat({ min: 0 }),
    (0, express_validator_1.query)('in_stock').optional().isBoolean(),
    handleValidationErrors
];
router.get('/', searchProductsValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { page = 1, limit = 20, sort = 'sort_order', order = 'asc', category, brand, price_min, price_max, in_stock } = req.query;
        const cacheKey = productCache.getCacheKey('products', req.query);
        const cached = productCache.get(cacheKey);
        if (cached) {
            const response = {
                success: true,
                data: cached,
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            };
            return res.json(response);
        }
        const conditions = ['is_active = true'];
        const params = [];
        let paramIndex = 1;
        if (category) {
            conditions.push(`category = $${paramIndex++}`);
            params.push(category);
        }
        if (brand) {
            conditions.push(`brand ILIKE $${paramIndex++}`);
            params.push(`%${brand}%`);
        }
        if (price_min !== undefined) {
            conditions.push(`price >= $${paramIndex++}`);
            params.push(price_min);
        }
        if (price_max !== undefined) {
            conditions.push(`price <= $${paramIndex++}`);
            params.push(price_max);
        }
        if (in_stock !== undefined) {
            conditions.push(`in_stock = $${paramIndex++}`);
            params.push(in_stock);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const allowedSortFields = ['name', 'category', 'brand', 'price', 'created_at', 'sort_order'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'sort_order';
        const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        const offset = (page - 1) * limit;
        const productsResult = await DatabaseService_1.databaseService.getProducts(category, brand, in_stock, limit, offset);
        if (productsResult.error) {
            throw new Error(productsResult.error.message);
        }
        const products = (productsResult.data || []).map(product => {
            return {
                ...product,
                created_at: product.created_at || new Date().toISOString(),
                updated_at: product.updated_at || new Date().toISOString(),
                specifications: (product.specifications || []).map(spec => typeof spec === 'string'
                    ? { name: spec, value: '' }
                    : spec)
            };
        });
        const total = products.length;
        const totalPages = Math.ceil(total / limit);
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Products listed successfully', {
            count: products.length,
            total,
            page,
            filters: { category, brand, price_min, price_max, in_stock },
            responseTime
        });
        const paginationData = {
            data: products,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        };
        productCache.set(cacheKey, paginationData);
        const response = {
            success: true,
            data: paginationData,
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Products listing failed', {
            error: error instanceof Error ? error.message : String(error),
            responseTime
        });
        const response = {
            success: false,
            error: 'Products listing failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/search', searchProductsValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { q, page = 1, limit = 20, category, brand, price_min, price_max, in_stock, fuzzy = false } = req.query;
        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const cacheKey = productCache.getCacheKey('search', { q, ...req.query });
        const cached = productCache.get(cacheKey);
        if (cached) {
            const response = {
                success: true,
                data: cached,
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            };
            return res.json(response);
        }
        let products;
        if (fuzzy) {
            products = await fuzzySearchProducts(q, category, limit);
        }
        else {
            const { query, params, paramIndex } = buildSearchQuery(q, {
                category,
                brand,
                price_min,
                price_max,
                in_stock
            });
            const offset = (page - 1) * limit;
            const paginatedQuery = `${query} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(limit, offset);
            const searchResult = await DatabaseService_1.databaseService.searchProducts(q, {
                category,
                brand,
                priceMin: price_min,
                priceMax: price_max,
                inStockOnly: in_stock
            }, 'relevance', limit, offset);
            if (searchResult.error) {
                throw new Error(searchResult.error.message);
            }
            products = searchResult.data || [];
        }
        let total = products.length;
        let totalPages = 1;
        if (!fuzzy) {
            total = products.length;
            totalPages = Math.ceil(total / limit);
        }
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Product search completed', {
            query: q,
            fuzzy,
            resultsCount: products.length,
            total,
            responseTime
        });
        const paginationData = {
            data: products,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            },
            meta: { searchQuery: q, fuzzySearch: fuzzy }
        };
        productCache.set(cacheKey, paginationData, productCache['SEARCH_TTL']);
        const response = {
            success: true,
            data: paginationData,
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Product search failed', {
            error: error instanceof Error ? error.message : String(error),
            query: req.query.q,
            responseTime
        });
        const response = {
            success: false,
            error: 'Product search failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/categories', async (req, res) => {
    const startTime = Date.now();
    try {
        const cached = productCache.get('categories');
        if (cached) {
            const response = {
                success: true,
                data: cached,
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            };
            return res.json(response);
        }
        const categories = [
            { category: 'cameras', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
            { category: 'recorders', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
            { category: 'storage', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
            { category: 'network', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
            { category: 'power', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
            { category: 'accessories', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 }
        ];
        productCache.set('categories', categories, productCache['CATEGORIES_TTL']);
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Product categories retrieved', {
            categoriesCount: categories.length,
            responseTime
        });
        const response = {
            success: true,
            data: categories,
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Categories retrieval failed', {
            error: error instanceof Error ? error.message : String(error),
            responseTime
        });
        const response = {
            success: false,
            error: 'Categories retrieval failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/brands', async (req, res) => {
    const startTime = Date.now();
    try {
        const cached = productCache.get('brands');
        if (cached) {
            const response = {
                success: true,
                data: cached,
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            };
            return res.json(response);
        }
        const productsResult = await DatabaseService_1.databaseService.getProducts();
        if (productsResult.error) {
            throw new Error(productsResult.error.message);
        }
        const products = productsResult.data || [];
        const brandMap = new Map();
        products.forEach((product) => {
            if (product.brand && product.brand.trim() !== '') {
                const brandKey = product.brand;
                if (!brandMap.has(brandKey)) {
                    brandMap.set(brandKey, {
                        brand: brandKey,
                        count: 0,
                        categories: new Set(),
                        in_stock_count: 0,
                        prices: []
                    });
                }
                const brandData = brandMap.get(brandKey);
                brandData.count++;
                brandData.categories.add(product.category);
                if (product.in_stock) {
                    brandData.in_stock_count++;
                }
                brandData.prices.push(parseFloat(product.price) || 0);
            }
        });
        const brands = Array.from(brandMap.values()).map((brandData) => {
            const prices = brandData.prices.sort((a, b) => a - b);
            return {
                brand: brandData.brand,
                count: brandData.count,
                categories: Array.from(brandData.categories),
                in_stock_count: brandData.in_stock_count,
                avg_price: prices.length > 0 ? Math.round((prices.reduce((sum, price) => sum + price, 0) / prices.length) * 100) / 100 : 0,
                min_price: prices.length > 0 ? prices[0] : 0,
                max_price: prices.length > 0 ? prices[prices.length - 1] : 0
            };
        }).sort((a, b) => a.brand.localeCompare(b.brand));
        productCache.set('brands', brands, productCache['CATEGORIES_TTL']);
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Product brands retrieved', {
            brandsCount: brands.length,
            responseTime
        });
        const response = {
            success: true,
            data: brands,
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Brands retrieval failed', {
            error: error instanceof Error ? error.message : String(error),
            responseTime
        });
        const response = {
            success: false,
            error: 'Brands retrieval failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/:id', [(0, express_validator_1.param)('id').isUUID().withMessage('Valid product ID is required'), handleValidationErrors], async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.params;
        const cacheKey = `product:${id}`;
        const cached = productCache.get(cacheKey);
        if (cached) {
            const response = {
                success: true,
                data: cached,
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            };
            return res.json(response);
        }
        const getResult = await DatabaseService_1.databaseService.getProduct(id);
        if (getResult.error || !getResult.data) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const product = {
            ...getResult.data,
            created_at: getResult.data.created_at || new Date().toISOString(),
            updated_at: getResult.data.updated_at || new Date().toISOString(),
            specifications: (getResult.data.specifications || []).map(spec => typeof spec === 'string'
                ? { name: spec, value: '' }
                : spec)
        };
        productCache.set(cacheKey, product);
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Product retrieved successfully', {
            productId: id,
            responseTime
        });
        const response = {
            success: true,
            data: product,
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Product retrieval failed', {
            error: error instanceof Error ? error.message : String(error),
            productId: req.params.id,
            responseTime
        });
        const response = {
            success: false,
            error: 'Product retrieval failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.post('/', createProductValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const productData = req.body;
        return res.status(501).json({
            success: false,
            error: 'Product creation not implemented',
            message: 'Product creation requires DatabaseService.createProduct method',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        });
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Product creation failed', {
            error: error instanceof Error ? error.message : String(error),
            responseTime
        });
        const response = {
            success: false,
            error: 'Product creation failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.put('/:id', updateProductValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.params;
        const updateData = req.body;
        const existingResult = await DatabaseService_1.databaseService.getProduct(id);
        if (existingResult.error || !existingResult.data) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        return res.status(501).json({
            success: false,
            error: 'Product update not implemented',
            message: 'Product update requires DatabaseService.updateProduct method',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        });
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Product update failed', {
            error: error instanceof Error ? error.message : String(error),
            productId: req.params.id,
            responseTime
        });
        const response = {
            success: false,
            error: 'Product update failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/cache/stats', (req, res) => {
    const stats = productCache.getStats();
    const response = {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
    };
    res.json(response);
});
router.delete('/cache', (req, res) => {
    productCache.clear();
    const response = {
        success: true,
        message: 'Product cache cleared successfully',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
    };
    res.json(response);
});
//# sourceMappingURL=products.js.map