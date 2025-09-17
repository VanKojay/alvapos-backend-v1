"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quotesRouter = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const DatabaseService_1 = require("../services/DatabaseService");
const logger_1 = require("../utils/logger");
const FinancialCalculationService_1 = require("../services/FinancialCalculationService");
const RealTimeSyncService_1 = require("../services/RealTimeSyncService");
const router = (0, express_1.Router)();
exports.quotesRouter = router;
function convertDbQuoteToApiQuote(dbQuote) {
    return {
        id: dbQuote.id,
        quote_number: dbQuote.quote_number,
        customer_id: dbQuote.customer_id,
        cart_data: {
            items: dbQuote.cart_data.items || [],
            laborItems: dbQuote.cart_data.laborItems || [],
            totals: {
                subtotal: dbQuote.cart_data.subtotal,
                itemsSubtotal: dbQuote.cart_data.subtotal,
                laborSubtotal: 0,
                itemDiscounts: 0,
                laborDiscounts: 0,
                totalDiscount: dbQuote.cart_data.totalDiscount,
                taxRate: dbQuote.tax_rate,
                taxAmount: dbQuote.cart_data.taxAmount,
                finalTotal: dbQuote.cart_data.finalTotal
            },
            totalDiscount: dbQuote.cart_data.totalDiscount
        },
        customer_snapshot: dbQuote.customer_snapshot,
        status: dbQuote.status,
        tax_rate: dbQuote.tax_rate,
        subtotal: dbQuote.cart_data.subtotal,
        tax_amount: dbQuote.cart_data.taxAmount,
        final_total: dbQuote.cart_data.finalTotal,
        source: dbQuote.source,
        template_id: dbQuote.template_id,
        boq_import_id: dbQuote.boq_import_id,
        created_at: dbQuote.created_at,
        updated_at: dbQuote.updated_at,
        valid_until: dbQuote.valid_until,
        notes: dbQuote.notes,
        metadata: dbQuote.metadata
    };
}
function convertApiCustomerToDbCustomer(apiCustomer) {
    return {
        id: apiCustomer.id,
        name: apiCustomer.name,
        email: apiCustomer.email,
        phone: apiCustomer.phone,
        company: apiCustomer.company,
        address: apiCustomer.address,
        total_quotes: apiCustomer.total_quotes,
        created_at: apiCustomer.created_at,
        updated_at: apiCustomer.updated_at
    };
}
function convertDbCustomerToApiCustomer(dbCustomer) {
    return {
        id: dbCustomer.id || '',
        name: dbCustomer.name,
        email: dbCustomer.email,
        phone: dbCustomer.phone,
        company: dbCustomer.company,
        address: dbCustomer.address,
        total_quotes: dbCustomer.total_quotes || 0,
        created_at: dbCustomer.created_at || new Date().toISOString(),
        updated_at: dbCustomer.updated_at || new Date().toISOString()
    };
}
function generateQuoteNumber() {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `QT${year}-${timestamp}${random}`;
}
function calculateCartTotals(cartData, taxRate = 0.10) {
    logger_1.Logger.warn('Using deprecated calculateCartTotals function. Use financialCalculationService instead.');
    const result = FinancialCalculationService_1.financialCalculationService.calculateComprehensiveCartTotals(cartData, taxRate);
    if (!result.isValid) {
        logger_1.Logger.error('Cart calculation failed with errors', { errors: result.errors });
    }
    return result.totals;
}
function validateCartData(cartData) {
    const validationResult = FinancialCalculationService_1.financialCalculationService.validateCartData(cartData);
    return validationResult.errors;
}
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
const createQuoteValidation = [
    (0, express_validator_1.body)('cart_data').notEmpty().withMessage('Cart data is required'),
    (0, express_validator_1.body)('tax_rate').optional().isFloat({ min: 0, max: 1 }).withMessage('Tax rate must be between 0 and 1'),
    (0, express_validator_1.body)('source').optional().isIn(['fresh', 'boq', 'template']).withMessage('Invalid source type'),
    (0, express_validator_1.body)('customer_data.name').optional().isString().isLength({ min: 1 }).withMessage('Customer name is required when provided'),
    (0, express_validator_1.body)('customer_data.email').optional().isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('valid_days').optional().isInt({ min: 1, max: 365 }).withMessage('Valid days must be between 1 and 365'),
    handleValidationErrors
];
const updateQuoteValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Valid quote ID is required'),
    (0, express_validator_1.body)('tax_rate').optional().isFloat({ min: 0, max: 1 }).withMessage('Tax rate must be between 0 and 1'),
    (0, express_validator_1.body)('status').optional().isIn(['draft', 'sent', 'accepted', 'rejected', 'expired']).withMessage('Invalid status'),
    handleValidationErrors
];
const getQuoteValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Valid quote ID is required'),
    handleValidationErrors
];
const listQuotesValidation = [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    (0, express_validator_1.query)('status').optional().custom((value) => {
        const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
        if (Array.isArray(value)) {
            return value.every(s => validStatuses.includes(s));
        }
        return validStatuses.includes(value);
    }).withMessage('Invalid status filter'),
    handleValidationErrors
];
router.post('/', createQuoteValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const sessionId = res.locals.sessionId;
        const requestData = req.body;
        const quoteNumber = generateQuoteNumber();
        const validUntil = requestData.valid_days
            ? new Date(Date.now() + (requestData.valid_days * 24 * 60 * 60 * 1000)).toISOString()
            : new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
        console.log("===================DEBUG ALVAMITRA PAYLOAD===================");
        console.log("Quote Number       :", quoteNumber);
        const alvamitraQuoteData = {
            quote_number: quoteNumber,
            id_pengguna: '66',
            organisasi_kode: '20191214071651',
            nomor_whatsapp: requestData.nomor_whatsapp,
            cart_data: requestData.cart_data || { items: [], laborItems: [] },
            notes: requestData.notes,
            tax_rate: requestData.tax_rate || 0.10
        };
        const quoteResult = await DatabaseService_1.databaseService.createQuoteAlvamitra(alvamitraQuoteData);
        if (quoteResult.error || !quoteResult.data) {
            console.error('Quote creation failed |', {
                error: quoteResult.error,
                sessionId: res.locals.requestId,
                responseTime: Date.now() - startTime
            });
            return res.status(500).json({
                success: false,
                error: 'Failed to create quote',
                message: quoteResult.error?.message || 'Unknown error',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const response = {
            success: true,
            data: {
                quote_number: alvamitraQuoteData.quote_number,
                status: 'draft'
            },
            message: 'Quote created successfully',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(201).json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        console.error('Quote creation failed', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: res.locals.sessionId,
            responseTime
        });
        res.status(500).json({
            success: false,
            error: 'Quote creation failed',
            message: error instanceof Error ? error.message : 'Internal server error',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        });
    }
});
router.get('/:id', getQuoteValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.params;
        const sessionId = res.locals.sessionId;
        DatabaseService_1.databaseService.setSession(sessionId);
        const result = await DatabaseService_1.databaseService.getQuote(id);
        if (result.error || !result.data) {
            return res.status(404).json({
                success: false,
                error: 'Quote not found',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const dbQuote = result.data;
        const quote = {
            id: dbQuote.id,
            quote_number: dbQuote.quote_number,
            customer_id: dbQuote.customer_id,
            cart_data: {
                items: dbQuote.cart_data.items || [],
                laborItems: dbQuote.cart_data.laborItems || [],
                totals: {
                    subtotal: dbQuote.cart_data.subtotal,
                    itemsSubtotal: dbQuote.cart_data.subtotal,
                    laborSubtotal: 0,
                    itemDiscounts: 0,
                    laborDiscounts: 0,
                    totalDiscount: dbQuote.cart_data.totalDiscount,
                    taxRate: dbQuote.tax_rate,
                    taxAmount: dbQuote.cart_data.taxAmount,
                    finalTotal: dbQuote.cart_data.finalTotal
                }
            },
            customer_snapshot: dbQuote.customer_snapshot,
            status: dbQuote.status,
            tax_rate: dbQuote.tax_rate,
            subtotal: dbQuote.cart_data.subtotal,
            tax_amount: dbQuote.cart_data.taxAmount,
            final_total: dbQuote.cart_data.finalTotal,
            source: dbQuote.source,
            template_id: dbQuote.template_id,
            boq_import_id: dbQuote.boq_import_id,
            created_at: dbQuote.created_at,
            updated_at: dbQuote.updated_at,
            valid_until: dbQuote.valid_until,
            notes: dbQuote.notes,
            metadata: dbQuote.metadata
        };
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Quote retrieved successfully', {
            quoteId: id,
            sessionId,
            responseTime
        });
        const response = {
            success: true,
            data: quote,
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Quote retrieval failed', {
            error: error instanceof Error ? error.message : String(error),
            quoteId: req.params.id,
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Quote retrieval failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.put('/:id', updateQuoteValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.params;
        const sessionId = res.locals.sessionId;
        const updateData = req.body;
        DatabaseService_1.databaseService.setSession(sessionId);
        const existingResult = await DatabaseService_1.databaseService.getQuote(id);
        if (existingResult.error || !existingResult.data) {
            return res.status(404).json({
                success: false,
                error: 'Quote not found or access denied',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const existingQuote = existingResult.data;
        const updatePayload = {};
        if (updateData.cart_data) {
            const taxRate = updateData.tax_rate || existingQuote.tax_rate;
            const calculationResult = FinancialCalculationService_1.financialCalculationService.calculateComprehensiveCartTotals(updateData.cart_data, taxRate);
            if (!calculationResult.isValid || calculationResult.errors.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid cart data or calculation failed',
                    validation_errors: calculationResult.errors,
                    timestamp: new Date().toISOString(),
                    requestId: res.locals.requestId
                });
            }
            const totals = calculationResult.totals;
            const processedCartData = calculationResult.updatedCartData;
            const apiCartData = {
                items: processedCartData.items || [],
                laborItems: processedCartData.laborItems || [],
                totals: {
                    subtotal: totals.subtotal,
                    itemsSubtotal: totals.itemsSubtotal || totals.subtotal,
                    laborSubtotal: totals.laborSubtotal || 0,
                    itemDiscounts: totals.itemDiscounts || 0,
                    laborDiscounts: totals.laborDiscounts || 0,
                    totalDiscount: processedCartData.totalDiscount,
                    taxRate: taxRate,
                    taxAmount: totals.taxAmount,
                    finalTotal: totals.finalTotal
                },
                totalDiscount: processedCartData.totalDiscount,
                metadata: processedCartData.metadata
            };
            updatePayload.cart_data = apiCartData;
            updatePayload.tax_rate = taxRate;
            try {
                await RealTimeSyncService_1.realTimeSyncService.syncCalculation(sessionId, id, processedCartData, taxRate);
            }
            catch (syncError) {
                logger_1.Logger.warn('Real-time calculation sync failed', { quoteId: id, sessionId, syncError });
            }
        }
        if (updateData.status !== undefined) {
            updatePayload.status = updateData.status;
        }
        if (updateData.tax_rate !== undefined) {
            updatePayload.tax_rate = updateData.tax_rate;
        }
        if (updateData.notes !== undefined) {
            updatePayload.notes = updateData.notes;
        }
        if (updateData.valid_until !== undefined) {
            updatePayload.valid_until = updateData.valid_until;
        }
        if (updateData.metadata !== undefined) {
            updatePayload.metadata = updateData.metadata;
        }
        if (updateData.customer_data && existingQuote.customer_id) {
            const customerUpdateData = {};
            if (updateData.customer_data.name)
                customerUpdateData.name = updateData.customer_data.name;
            if (updateData.customer_data.email)
                customerUpdateData.email = updateData.customer_data.email;
            if (updateData.customer_data.phone)
                customerUpdateData.phone = updateData.customer_data.phone;
            if (updateData.customer_data.company)
                customerUpdateData.company = updateData.customer_data.company;
            if (updateData.customer_data.address)
                customerUpdateData.address = updateData.customer_data.address;
            if (Object.keys(customerUpdateData).length > 0) {
                customerUpdateData.id = existingQuote.customer_id;
                const customerResult = await DatabaseService_1.databaseService.upsertCustomer(customerUpdateData);
                if (customerResult.data) {
                    updatePayload.customer_snapshot = convertDbCustomerToApiCustomer(customerResult.data);
                }
            }
        }
        if (Object.keys(updatePayload).length === 0 && !updateData.cart_data) {
            return res.status(400).json({
                success: false,
                error: 'No valid updates provided',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const dbUpdatePayload = {
            ...updatePayload,
            cart_data: updatePayload.cart_data ? {
                items: updatePayload.cart_data.items || [],
                laborItems: updatePayload.cart_data.laborItems || [],
                subtotal: updatePayload.cart_data.totals?.subtotal || 0,
                taxAmount: updatePayload.cart_data.totals?.taxAmount || 0,
                finalTotal: updatePayload.cart_data.totals?.finalTotal || 0,
                totalDiscount: updatePayload.cart_data.totalDiscount
            } : undefined,
            customer_snapshot: updatePayload.customer_snapshot
        };
        const result = await DatabaseService_1.databaseService.updateQuote(id, dbUpdatePayload);
        if (result.error || !result.data) {
            return res.status(500).json({
                success: false,
                error: 'Failed to update quote',
                message: result.error?.message || 'Unknown error',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const updatedQuote = convertDbQuoteToApiQuote(result.data);
        try {
            RealTimeSyncService_1.realTimeSyncService.registerOptimisticUpdate({
                id: updatedQuote.id,
                type: 'quote',
                operation: 'update',
                data: updatedQuote,
                timestamp: new Date().toISOString(),
                confirmed: false
            });
        }
        catch (syncError) {
            logger_1.Logger.warn('Failed to register optimistic update', { quoteId: id, syncError });
        }
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Quote updated successfully', {
            quoteId: id,
            sessionId,
            updatedFields: Object.keys(updatePayload),
            responseTime,
            hasCartUpdate: updateData.cart_data !== undefined
        });
        const response = {
            success: true,
            data: updatedQuote,
            message: 'Quote updated successfully',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Quote update failed', {
            error: error instanceof Error ? error.message : String(error),
            quoteId: req.params.id,
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Quote update failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.delete('/:id', getQuoteValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.params;
        const sessionId = res.locals.sessionId;
        DatabaseService_1.databaseService.setSession(sessionId);
        const result = await DatabaseService_1.databaseService.updateQuote(id, { status: 'expired' });
        if (result.error || !result.data) {
            return res.status(404).json({
                success: false,
                error: 'Quote not found or access denied',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Quote deleted successfully', {
            quoteId: id,
            sessionId,
            responseTime
        });
        const response = {
            success: true,
            message: 'Quote deleted successfully',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Quote deletion failed', {
            error: error instanceof Error ? error.message : String(error),
            quoteId: req.params.id,
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Quote deletion failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/', listQuotesValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const sessionId = res.locals.sessionId;
        const { page = 1, limit = 20, sort = 'updated_at', order = 'desc', status, source, date_from, date_to, min_total, max_total, customer_id, q } = req.query;
        const conditions = ['(q.session_id = $1 OR $1 IS NULL)'];
        const params = [sessionId];
        let paramIndex = 2;
        if (status) {
            const statusArray = Array.isArray(status) ? status : [status];
            conditions.push(`q.status = ANY($${paramIndex++})`);
            params.push(statusArray);
        }
        if (source) {
            conditions.push(`q.source = $${paramIndex++}`);
            params.push(source);
        }
        if (customer_id) {
            conditions.push(`q.customer_id = $${paramIndex++}`);
            params.push(customer_id);
        }
        if (date_from) {
            conditions.push(`q.created_at >= $${paramIndex++}`);
            params.push(date_from);
        }
        if (date_to) {
            conditions.push(`q.created_at <= $${paramIndex++}`);
            params.push(date_to);
        }
        if (min_total) {
            conditions.push(`q.final_total >= $${paramIndex++}`);
            params.push(min_total);
        }
        if (max_total) {
            conditions.push(`q.final_total <= $${paramIndex++}`);
            params.push(max_total);
        }
        if (q) {
            conditions.push(`q.search_vector @@ plainto_tsquery('english', $${paramIndex++})`);
            params.push(q);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const allowedSortFields = ['created_at', 'updated_at', 'final_total', 'quote_number'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'updated_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const offset = (page - 1) * limit;
        DatabaseService_1.databaseService.setSession(sessionId);
        const quotesResult = await DatabaseService_1.databaseService.getSessionQuotes(limit, offset);
        if (quotesResult.error || !quotesResult.data) {
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch quotes',
                message: quotesResult.error?.message || 'Unknown error',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        let filteredQuotes = quotesResult.data;
        if (status) {
            const statusArray = Array.isArray(status) ? status : [status];
            filteredQuotes = filteredQuotes.filter(quote => statusArray.includes(quote.status));
        }
        if (source) {
            filteredQuotes = filteredQuotes.filter(quote => quote.source === source);
        }
        if (customer_id) {
            filteredQuotes = filteredQuotes.filter(quote => quote.customer_id === customer_id);
        }
        if (min_total) {
            filteredQuotes = filteredQuotes.filter(quote => quote.cart_data.finalTotal >= min_total);
        }
        if (max_total) {
            filteredQuotes = filteredQuotes.filter(quote => quote.cart_data.finalTotal <= max_total);
        }
        const quotes = filteredQuotes.map(quote => ({
            id: quote.id,
            quote_number: quote.quote_number,
            status: quote.status,
            final_total: quote.cart_data.finalTotal,
            created_at: quote.created_at,
            updated_at: quote.updated_at,
            customer_name: quote.customer_snapshot?.name || 'Unknown',
            item_count: quote.cart_data.items?.length || 0,
            labor_count: quote.cart_data.laborItems?.length || 0
        }));
        const total = quotes.length;
        const totalPages = Math.ceil(total / limit);
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Quotes listed successfully', {
            sessionId,
            count: quotes.length,
            total,
            page,
            responseTime
        });
        const response = {
            success: true,
            data: {
                data: quotes,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            },
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Quotes listing failed', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Quotes listing failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
//# sourceMappingURL=quotes.js.map