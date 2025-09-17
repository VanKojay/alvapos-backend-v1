"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customersRouter = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const DatabaseService_1 = require("../services/DatabaseService");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
exports.customersRouter = router;
function normalizePhone(phone) {
    return phone.replace(/\D/g, '').replace(/^1/, '');
}
function normalizeEmail(email) {
    return email.toLowerCase().trim();
}
async function findPotentialDuplicates(customerData, sessionId) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    if (customerData.email) {
        conditions.push(`LOWER(email) = $${paramIndex++}`);
        params.push(normalizeEmail(customerData.email));
    }
    if (customerData.phone) {
        const normalizedPhone = normalizePhone(customerData.phone);
        if (normalizedPhone.length >= 10) {
            conditions.push(`RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = RIGHT($${paramIndex++}, 10)`);
            params.push(normalizedPhone);
        }
    }
    if (customerData.name && customerData.company) {
        conditions.push(`(similarity(name, $${paramIndex++}) > 0.6 AND similarity(COALESCE(company, ''), $${paramIndex++}) > 0.6)`);
        params.push(customerData.name, customerData.company);
    }
    if (conditions.length === 0) {
        return [];
    }
    const query = `
    SELECT * FROM customers 
    WHERE (${conditions.join(' OR ')})
    AND (session_id = $${paramIndex++} OR session_id IS NULL OR $${paramIndex - 1} IS NULL)
    ORDER BY 
      CASE WHEN email IS NOT NULL AND LOWER(email) = $1 THEN 1
           WHEN phone IS NOT NULL THEN 2
           ELSE 3 END,
      updated_at DESC
    LIMIT 5
  `;
    params.push(sessionId);
    const searchResult = await DatabaseService_1.databaseService.searchCustomers('', 20);
    if (searchResult.error) {
        throw new Error(searchResult.error.message);
    }
    return (searchResult.data || []).map(customer => ({
        ...customer,
        id: customer.id,
        created_at: customer.created_at || new Date().toISOString(),
        updated_at: customer.updated_at || new Date().toISOString(),
        total_quotes: customer.total_quotes || 0,
        last_quote_date: customer.last_quote_date || null
    }));
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
const createCustomerValidation = [
    (0, express_validator_1.body)('name').isString().isLength({ min: 1, max: 255 }).withMessage('Name is required and must be less than 255 characters'),
    (0, express_validator_1.body)('email').optional().isEmail().isLength({ max: 255 }).withMessage('Valid email is required'),
    (0, express_validator_1.body)('phone').optional().isString().isLength({ min: 10, max: 20 }).withMessage('Valid phone number is required'),
    (0, express_validator_1.body)('company').optional().isString().isLength({ max: 255 }).withMessage('Company name must be less than 255 characters'),
    (0, express_validator_1.body)('address.street').optional().isString().isLength({ max: 255 }),
    (0, express_validator_1.body)('address.city').optional().isString().isLength({ max: 100 }),
    (0, express_validator_1.body)('address.state').optional().isString().isLength({ max: 100 }),
    (0, express_validator_1.body)('address.postal_code').optional().isString().isLength({ max: 20 }),
    (0, express_validator_1.body)('address.country').optional().isString().isLength({ max: 100 }),
    handleValidationErrors
];
const updateCustomerValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Valid customer ID is required'),
    (0, express_validator_1.body)('name').optional().isString().isLength({ min: 1, max: 255 }).withMessage('Name must be less than 255 characters'),
    (0, express_validator_1.body)('email').optional().isEmail().isLength({ max: 255 }).withMessage('Valid email is required'),
    (0, express_validator_1.body)('phone').optional().isString().isLength({ min: 10, max: 20 }).withMessage('Valid phone number is required'),
    (0, express_validator_1.body)('company').optional().isString().isLength({ max: 255 }).withMessage('Company name must be less than 255 characters'),
    handleValidationErrors
];
const getCustomerValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Valid customer ID is required'),
    handleValidationErrors
];
const listCustomersValidation = [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    (0, express_validator_1.query)('sort').optional().isIn(['name', 'company', 'email', 'created_at', 'updated_at', 'total_quotes']).withMessage('Invalid sort field'),
    (0, express_validator_1.query)('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc'),
    handleValidationErrors
];
router.post('/', createCustomerValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const sessionId = res.locals.sessionId;
        const customerData = req.body;
        const duplicates = await findPotentialDuplicates(customerData, sessionId);
        if (duplicates.length > 0) {
            const response = {
                success: false,
                error: 'Potential duplicates found',
                message: 'Please review potential duplicate customers before creating',
                data: { duplicates },
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            };
            return res.status(409).json(response);
        }
        const createResult = await DatabaseService_1.databaseService.upsertCustomer({
            session_id: sessionId,
            name: customerData.name,
            email: customerData.email,
            phone: customerData.phone,
            company: customerData.company,
            address: customerData.address
        });
        if (createResult.error) {
            throw new Error(createResult.error.message);
        }
        const customer = {
            ...createResult.data,
            id: createResult.data.id,
            created_at: createResult.data.created_at || new Date().toISOString(),
            updated_at: createResult.data.updated_at || new Date().toISOString(),
            total_quotes: 0,
            last_quote_date: null
        };
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Customer created successfully', {
            customerId: customer.id,
            sessionId,
            customerName: customer.name,
            responseTime
        });
        const response = {
            success: true,
            data: customer,
            message: 'Customer created successfully',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(201).json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Customer creation failed', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: res.locals.sessionId,
            responseTime
        });
        if (error instanceof Error && error.message.includes('unique constraint')) {
            const response = {
                success: false,
                error: 'Customer with this email already exists',
                message: 'Please use a different email or update the existing customer',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            };
            return res.status(409).json(response);
        }
        const response = {
            success: false,
            error: 'Customer creation failed',
            message: error instanceof Error ? error.message : 'Internal server error',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.post('/force', createCustomerValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const sessionId = res.locals.sessionId;
        const customerData = req.body;
        const createResult = await DatabaseService_1.databaseService.upsertCustomer({
            session_id: sessionId,
            name: customerData.name,
            email: customerData.email,
            phone: customerData.phone,
            company: customerData.company,
            address: customerData.address
        });
        if (createResult.error) {
            throw new Error(createResult.error.message);
        }
        const customer = {
            ...createResult.data,
            id: createResult.data.id,
            created_at: createResult.data.created_at || new Date().toISOString(),
            updated_at: createResult.data.updated_at || new Date().toISOString(),
            total_quotes: 0,
            last_quote_date: null
        };
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Customer force created successfully', {
            customerId: customer.id,
            sessionId,
            customerName: customer.name,
            responseTime
        });
        const response = {
            success: true,
            data: customer,
            message: 'Customer created successfully',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(201).json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Customer force creation failed', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Customer creation failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/:id', getCustomerValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.params;
        const sessionId = res.locals.sessionId;
        const getResult = await DatabaseService_1.databaseService.getCustomer(id);
        if (getResult.error || !getResult.data) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const customer = {
            ...getResult.data,
            id: getResult.data.id,
            created_at: getResult.data.created_at || new Date().toISOString(),
            updated_at: getResult.data.updated_at || new Date().toISOString(),
            total_quotes: getResult.data.total_quotes || 0,
            last_quote_date: getResult.data.last_quote_date || null
        };
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Customer retrieved successfully', {
            customerId: id,
            sessionId,
            responseTime
        });
        const response = {
            success: true,
            data: customer,
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Customer retrieval failed', {
            error: error instanceof Error ? error.message : String(error),
            customerId: req.params.id,
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Customer retrieval failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.put('/:id', updateCustomerValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.params;
        const sessionId = res.locals.sessionId;
        const updateData = req.body;
        const existingResult = await DatabaseService_1.databaseService.getCustomer(id);
        if (existingResult.error || !existingResult.data) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found or access denied',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid updates provided',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const updateResult = await DatabaseService_1.databaseService.upsertCustomer({
            id,
            ...existingResult.data,
            ...updateData
        });
        if (updateResult.error) {
            throw new Error(updateResult.error.message);
        }
        const updatedCustomer = {
            ...updateResult.data,
            id: updateResult.data.id,
            created_at: updateResult.data.created_at || new Date().toISOString(),
            updated_at: updateResult.data.updated_at || new Date().toISOString(),
            total_quotes: updateResult.data.total_quotes || 0,
            last_quote_date: updateResult.data.last_quote_date || null
        };
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Customer updated successfully', {
            customerId: id,
            sessionId,
            updatedFields: Object.keys(updateData),
            responseTime
        });
        const response = {
            success: true,
            data: updatedCustomer,
            message: 'Customer updated successfully',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Customer update failed', {
            error: error instanceof Error ? error.message : String(error),
            customerId: req.params.id,
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Customer update failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/', listCustomersValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const sessionId = res.locals.sessionId;
        const { page = 1, limit = 20, sort = 'updated_at', order = 'desc', q, name, email, company } = req.query;
        const conditions = ['(session_id = $1 OR session_id IS NULL OR $1 IS NULL)'];
        const params = [sessionId];
        let paramIndex = 2;
        if (q) {
            conditions.push(`search_vector @@ plainto_tsquery('english', $${paramIndex++})`);
            params.push(q);
        }
        if (name) {
            conditions.push(`name ILIKE $${paramIndex++}`);
            params.push(`%${name}%`);
        }
        if (email) {
            conditions.push(`email ILIKE $${paramIndex++}`);
            params.push(`%${email}%`);
        }
        if (company) {
            conditions.push(`company ILIKE $${paramIndex++}`);
            params.push(`%${company}%`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const allowedSortFields = ['name', 'company', 'email', 'created_at', 'updated_at', 'total_quotes'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'updated_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const offset = (page - 1) * limit;
        const searchResult = await DatabaseService_1.databaseService.searchCustomers(q || '', limit);
        if (searchResult.error) {
            throw new Error(searchResult.error.message);
        }
        const customers = (searchResult.data || []).map(customer => ({
            ...customer,
            id: customer.id,
            created_at: customer.created_at || new Date().toISOString(),
            updated_at: customer.updated_at || new Date().toISOString(),
            total_quotes: customer.total_quotes || 0,
            last_quote_date: customer.last_quote_date || null
        }));
        const total = customers.length;
        const totalPages = Math.ceil(total / limit);
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Customers listed successfully', {
            sessionId,
            count: customers.length,
            total,
            page,
            hasSearch: !!q,
            responseTime
        });
        const response = {
            success: true,
            data: {
                data: customers,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                },
                meta: q ? { searchQuery: q } : undefined
            },
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Customers listing failed', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Customers listing failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/:id/quotes', getCustomerValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.params;
        const sessionId = res.locals.sessionId;
        const { page = 1, limit = 20 } = req.query;
        const customerResult = await DatabaseService_1.databaseService.getCustomer(id);
        if (customerResult.error || !customerResult.data) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const offset = (Number(page) - 1) * Number(limit);
        const quotesResult = await DatabaseService_1.databaseService.getSessionQuotes(Number(limit), offset);
        if (quotesResult.error) {
            throw new Error(quotesResult.error.message);
        }
        const allQuotes = quotesResult.data || [];
        const quotes = allQuotes.filter(q => q.customer_id === id).map(row => ({
            ...row,
            id: row.id,
            created_at: row.created_at || new Date().toISOString(),
            updated_at: row.updated_at || new Date().toISOString(),
            customer_snapshot: {
                id: customerResult.data.id,
                name: customerResult.data.name,
                email: customerResult.data.email,
                phone: customerResult.data.phone,
                company: customerResult.data.company,
                address: customerResult.data.address,
                created_at: customerResult.data.created_at || new Date().toISOString(),
                updated_at: customerResult.data.updated_at || new Date().toISOString(),
                total_quotes: customerResult.data.total_quotes || 0,
                last_quote_date: customerResult.data.last_quote_date || null
            },
            item_count: row.cart_data?.items?.length || 0,
            labor_count: row.cart_data?.laborItems?.length || 0,
            subtotal: row.cart_data?.subtotal || 0,
            tax_amount: row.cart_data?.taxAmount || 0,
            final_total: row.cart_data?.finalTotal || 0
        }));
        const total = quotes.length;
        const totalPages = Math.ceil(total / Number(limit));
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Customer quotes retrieved successfully', {
            customerId: id,
            sessionId,
            quoteCount: quotes.length,
            total,
            responseTime
        });
        const response = {
            success: true,
            data: {
                data: quotes,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages,
                    hasNext: Number(page) < totalPages,
                    hasPrev: Number(page) > 1
                }
            },
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Customer quotes retrieval failed', {
            error: error instanceof Error ? error.message : String(error),
            customerId: req.params.id,
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Customer quotes retrieval failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.post('/search/duplicates', createCustomerValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const sessionId = res.locals.sessionId;
        const customerData = req.body;
        const duplicates = await findPotentialDuplicates(customerData, sessionId);
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Duplicate search completed', {
            sessionId,
            duplicatesFound: duplicates.length,
            responseTime
        });
        const response = {
            success: true,
            data: { duplicates },
            message: duplicates.length > 0 ? 'Potential duplicates found' : 'No duplicates found',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Duplicate search failed', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Duplicate search failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
//# sourceMappingURL=customers.js.map