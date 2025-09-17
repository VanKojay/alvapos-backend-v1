"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const DatabaseService_1 = require("../services/DatabaseService");
const MigrationManager_1 = require("../database/MigrationManager");
const sessionMiddleware_1 = require("../middleware/sessionMiddleware");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.use(sessionMiddleware_1.sessionMiddleware);
router.use((req, res, next) => {
    if (req.sessionId) {
        DatabaseService_1.databaseService.setSession(req.sessionId);
        req.db = DatabaseService_1.databaseService;
    }
    next();
});
router.get('/health', async (req, res) => {
    try {
        const health = await DatabaseService_1.databaseService.healthCheck();
        res.status(health.healthy ? 200 : 503).json({
            success: health.healthy,
            ...health.details
        });
    }
    catch (error) {
        logger_1.Logger.error('Database health check failed', error);
        res.status(503).json({
            success: false,
            error: 'Health check failed',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
router.get('/stats', async (req, res) => {
    try {
        const { data: stats, error } = await req.db.getDatabaseStats();
        if (error) {
            throw new Error(error.message || 'Failed to get database stats');
        }
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to get database stats', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/migrations/status', async (req, res) => {
    try {
        const status = await MigrationManager_1.migrationManager.getMigrationStatus();
        res.json({
            success: true,
            data: status
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to get migration status', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/migrations/run', async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production' && !req.headers['x-allow-migrations']) {
            return res.status(403).json({
                success: false,
                error: 'Migration execution not allowed in production'
            });
        }
        const results = await MigrationManager_1.migrationManager.runPendingMigrations();
        const success = results.every(r => r.success);
        res.status(success ? 200 : 500).json({
            success,
            results,
            message: success ? 'All migrations completed successfully' : 'Some migrations failed'
        });
    }
    catch (error) {
        logger_1.Logger.error('Migration execution failed', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Migration failed'
        });
    }
});
router.get('/migrations/validate', async (req, res) => {
    try {
        const validation = await MigrationManager_1.migrationManager.getMigrationStatus();
        res.json({
            success: validation.upToDate,
            data: validation
        });
    }
    catch (error) {
        logger_1.Logger.error('Migration validation failed', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Validation failed'
        });
    }
});
router.post('/customers', async (req, res) => {
    try {
        const customerData = req.body;
        if (!customerData.name) {
            return res.status(400).json({
                success: false,
                error: 'Customer name is required'
            });
        }
        const { data: customer, error } = await req.db.upsertCustomer(customerData);
        if (error) {
            throw new Error(error.message || 'Failed to save customer');
        }
        res.json({
            success: true,
            data: customer
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to save customer', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save customer'
        });
    }
});
router.get('/customers/search', async (req, res) => {
    try {
        const query = req.query.q;
        const limit = parseInt(req.query.limit) || 20;
        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
        }
        const { data: customers, error } = await req.db.searchCustomers(query, limit);
        if (error) {
            throw new Error(error.message || 'Search failed');
        }
        res.json({
            success: true,
            data: customers || []
        });
    }
    catch (error) {
        logger_1.Logger.error('Customer search failed', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Search failed'
        });
    }
});
router.get('/products', async (req, res) => {
    try {
        const { category, search, inStockOnly = 'false', limit = '100', offset = '0' } = req.query;
        const { data: products, error } = await req.db.getProducts(category, search, inStockOnly === 'true', parseInt(limit), parseInt(offset));
        if (error) {
            throw new Error(error.message || 'Failed to get products');
        }
        console.log('>> Sending products to frontend:', JSON.stringify(products.slice(0, 2), null, 2));
        res.json({
            success: true,
            data: products || []
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to get products', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get products'
        });
    }
});
router.post('/products/search', async (req, res) => {
    try {
        const { query = '', filters = {}, sortBy = 'relevance', limit = 50, offset = 0 } = req.body;
        const startTime = Date.now();
        const { data: products, error } = await req.db.searchProducts(query, filters, sortBy, limit, offset);
        if (error) {
            throw new Error(error.message || 'Search failed');
        }
        const responseTime = Date.now() - startTime;
        if (req.sessionId && query.trim()) {
            await req.db.logSearchQuery(query, 'product', products?.length || 0, responseTime);
        }
        res.json({
            success: true,
            data: products || [],
            meta: {
                query,
                count: products?.length || 0,
                responseTime
            }
        });
    }
    catch (error) {
        logger_1.Logger.error('Product search failed', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Search failed'
        });
    }
});
router.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Product ID is required' });
        }
        const { data: product, error } = await req.db.getProduct(id);
        if (error) {
            throw new Error(error.message || 'Failed to get product');
        }
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        res.json({
            success: true,
            data: product
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to get product', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get product'
        });
    }
});
router.post('/quotes', async (req, res) => {
    try {
        const quoteData = req.body;
        if (!quoteData.quote_number) {
            quoteData.quote_number = await req.db.generateQuoteNumber();
        }
        const { data: quote, error } = await req.db.createQuoteAlvamitra(quoteData);
        console.log("==========CALLER DATABASE.TS");
        console.log("==========CALLER DATABASE.TS");
        console.log(quote.items.length);
        if (error) {
            throw new Error(error.message || 'Failed to create quote');
        }
        res.status(201).json({
            success: true,
            data: quote
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to create quote', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create quote'
        });
    }
});
router.patch('/quotes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        if (!id) {
            return res.status(400).json({ error: 'Quote ID is required' });
        }
        const { data: quote, error } = await req.db.updateQuote(id, updates);
        if (error) {
            throw new Error(error.message || 'Failed to update quote');
        }
        res.json({
            success: true,
            data: quote
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to update quote', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update quote'
        });
    }
});
router.get('/quotes', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const { data: quotes, error } = await req.db.getSessionQuotes(limit, offset);
        if (error) {
            throw new Error(error.message || 'Failed to get quotes');
        }
        res.json({
            success: true,
            data: quotes || []
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to get quotes', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get quotes'
        });
    }
});
router.get('/templates', async (req, res) => {
    try {
        const category = req.query.category;
        const limit = parseInt(req.query.limit) || 50;
        const { data: templates, error } = await req.db.getTemplates(category, limit);
        if (error) {
            throw new Error(error.message || 'Failed to get templates');
        }
        res.json({
            success: true,
            data: templates || []
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to get templates', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get templates'
        });
    }
});
router.post('/templates', async (req, res) => {
    try {
        const templateData = req.body;
        if (!templateData.name || !templateData.category) {
            return res.status(400).json({
                success: false,
                error: 'Template name and category are required'
            });
        }
        const { data: template, error } = await req.db.createTemplate(templateData);
        if (error) {
            throw new Error(error.message || 'Failed to create template');
        }
        res.status(201).json({
            success: true,
            data: template
        });
    }
    catch (error) {
        logger_1.Logger.error('Failed to create template', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create template'
        });
    }
});
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        const limit = parseInt(req.query.limit) || 50;
        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
        }
        const startTime = Date.now();
        const { data: results, error } = await req.db.globalSearch(query, limit);
        if (error) {
            throw new Error(error.message || 'Search failed');
        }
        const responseTime = Date.now() - startTime;
        if (req.sessionId) {
            await req.db.logSearchQuery(query, 'global', results?.length || 0, responseTime);
        }
        res.json({
            success: true,
            data: results || [],
            meta: {
                query,
                count: results?.length || 0,
                responseTime
            }
        });
    }
    catch (error) {
        logger_1.Logger.error('Global search failed', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Search failed'
        });
    }
});
router.get('/search/suggestions', async (req, res) => {
    try {
        const partialQuery = req.query.q;
        const type = req.query.type || 'all';
        if (!partialQuery || partialQuery.trim().length < 1) {
            return res.json({
                success: true,
                data: []
            });
        }
        const { data: suggestions, error } = await req.db.getSearchSuggestions(partialQuery, type);
        if (error) {
            throw new Error(error.message || 'Failed to get suggestions');
        }
        res.json({
            success: true,
            data: suggestions || []
        });
    }
    catch (error) {
        logger_1.Logger.error('Search suggestions failed', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get suggestions'
        });
    }
});
router.post('/cleanup', async (req, res) => {
    try {
        const retentionDays = parseInt(req.body.retentionDays) || 7;
        const { data: result, error } = await req.db.cleanupExpiredSessions(retentionDays);
        if (error) {
            throw new Error(error.message || 'Cleanup failed');
        }
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        logger_1.Logger.error('Session cleanup failed', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Cleanup failed'
        });
    }
});
router.use((error, req, res, next) => {
    logger_1.Logger.error('Database route error', {
        error: error.message,
        path: req.path,
        method: req.method,
        sessionId: req.sessionId
    });
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
});
exports.default = router;
//# sourceMappingURL=database.js.map