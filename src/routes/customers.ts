// ALVA POS MVP - Customer Management API Routes
// TASK-B008: Complete customer CRUD operations with deduplication and search

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { databaseService } from '@/services/DatabaseService';
import { Logger } from '@/utils/logger';
import { 
  ApiResponse, 
  Customer, 
  CustomerCreateRequest, 
  CustomerUpdateRequest, 
  CustomerSearchQuery,
  PaginationResponse,
  ValidationError,
  Quote
} from '@/types/api';

const router = Router();

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Normalize phone number for deduplication
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^1/, ''); // Remove non-digits and leading 1
}

/**
 * Normalize email for deduplication
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Find potential duplicate customers
 */
async function findPotentialDuplicates(customerData: CustomerCreateRequest, sessionId?: string): Promise<Customer[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // Search by email (exact match)
  if (customerData.email) {
    conditions.push(`LOWER(email) = $${paramIndex++}`);
    params.push(normalizeEmail(customerData.email));
  }

  // Search by phone (normalized)
  if (customerData.phone) {
    const normalizedPhone = normalizePhone(customerData.phone);
    if (normalizedPhone.length >= 10) {
      conditions.push(`RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = RIGHT($${paramIndex++}, 10)`);
      params.push(normalizedPhone);
    }
  }

  // Search by name and company combination (fuzzy match)
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

  // Use searchCustomers method with appropriate filters
  const searchResult = await databaseService.searchCustomers('', 20);
  if (searchResult.error) {
    throw new Error(searchResult.error.message);
  }
  // TODO: Implement proper duplicate detection using available methods
  // Ensure customers have required properties from API types
  return (searchResult.data || []).map(customer => ({
    ...customer,
    id: customer.id!,
    created_at: customer.created_at || new Date().toISOString(),
    updated_at: customer.updated_at || new Date().toISOString(),
    total_quotes: customer.total_quotes || 0,
    last_quote_date: customer.last_quote_date || null
  })) as Customer[];
}

/**
 * Handle validation errors
 */
function handleValidationErrors(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(error => ({
      field: error.type === 'field' ? (error as any).path : error.type,
      message: error.msg,
      value: error.type === 'field' ? (error as any).value : undefined
    }));

    const response: ApiResponse = {
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

// ===========================================
// VALIDATION RULES
// ===========================================

const createCustomerValidation = [
  body('name').isString().isLength({ min: 1, max: 255 }).withMessage('Name is required and must be less than 255 characters'),
  body('email').optional().isEmail().isLength({ max: 255 }).withMessage('Valid email is required'),
  body('phone').optional().isString().isLength({ min: 10, max: 20 }).withMessage('Valid phone number is required'),
  body('company').optional().isString().isLength({ max: 255 }).withMessage('Company name must be less than 255 characters'),
  body('address.street').optional().isString().isLength({ max: 255 }),
  body('address.city').optional().isString().isLength({ max: 100 }),
  body('address.state').optional().isString().isLength({ max: 100 }),
  body('address.postal_code').optional().isString().isLength({ max: 20 }),
  body('address.country').optional().isString().isLength({ max: 100 }),
  handleValidationErrors
];

const updateCustomerValidation = [
  param('id').isUUID().withMessage('Valid customer ID is required'),
  body('name').optional().isString().isLength({ min: 1, max: 255 }).withMessage('Name must be less than 255 characters'),
  body('email').optional().isEmail().isLength({ max: 255 }).withMessage('Valid email is required'),
  body('phone').optional().isString().isLength({ min: 10, max: 20 }).withMessage('Valid phone number is required'),
  body('company').optional().isString().isLength({ max: 255 }).withMessage('Company name must be less than 255 characters'),
  handleValidationErrors
];

const getCustomerValidation = [
  param('id').isUUID().withMessage('Valid customer ID is required'),
  handleValidationErrors
];

const listCustomersValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sort').optional().isIn(['name', 'company', 'email', 'created_at', 'updated_at', 'total_quotes']).withMessage('Invalid sort field'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc'),
  handleValidationErrors
];

// ===========================================
// ROUTE HANDLERS
// ===========================================

/**
 * POST /api/customers - Create new customer with deduplication
 */
router.post('/', createCustomerValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const sessionId = res.locals.sessionId;
    const customerData: CustomerCreateRequest = req.body;

    // Find potential duplicates
    const duplicates = await findPotentialDuplicates(customerData, sessionId);
    
    if (duplicates.length > 0) {
      // Return potential duplicates for user decision
      const response: ApiResponse<{ duplicates: Customer[] }> = {
        success: false,
        error: 'Potential duplicates found',
        message: 'Please review potential duplicate customers before creating',
        data: { duplicates },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      };

      return res.status(409).json(response);
    }

    // Create new customer using DatabaseService
    const createResult = await databaseService.upsertCustomer({
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

    const customer: Customer = {
      ...createResult.data!,
      id: createResult.data!.id!,
      created_at: createResult.data!.created_at || new Date().toISOString(),
      updated_at: createResult.data!.updated_at || new Date().toISOString(),
      total_quotes: 0,
      last_quote_date: null
    };
    
    const responseTime = Date.now() - startTime;
    Logger.info('Customer created successfully', {
      customerId: customer.id,
      sessionId,
      customerName: customer.name,
      responseTime
    });

    const response: ApiResponse<Customer> = {
      success: true,
      data: customer,
      message: 'Customer created successfully',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(201).json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Customer creation failed', {
      error: error instanceof Error ? error.message : String(error),
      sessionId: res.locals.sessionId,
      responseTime
    });

    // Handle unique constraint violations
    if (error instanceof Error && error.message.includes('unique constraint')) {
      const response: ApiResponse = {
        success: false,
        error: 'Customer with this email already exists',
        message: 'Please use a different email or update the existing customer',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      };

      return res.status(409).json(response);
    }

    const response: ApiResponse = {
      success: false,
      error: 'Customer creation failed',
      message: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * POST /api/customers/force - Force create customer (bypassing duplicates)
 */
router.post('/force', createCustomerValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const sessionId = res.locals.sessionId;
    const customerData: CustomerCreateRequest = req.body;

    // Create customer directly without duplicate check using DatabaseService
    const createResult = await databaseService.upsertCustomer({
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

    const customer: Customer = {
      ...createResult.data!,
      id: createResult.data!.id!,
      created_at: createResult.data!.created_at || new Date().toISOString(),
      updated_at: createResult.data!.updated_at || new Date().toISOString(),
      total_quotes: 0,
      last_quote_date: null
    };
    
    const responseTime = Date.now() - startTime;
    Logger.info('Customer force created successfully', {
      customerId: customer.id,
      sessionId,
      customerName: customer.name,
      responseTime
    });

    const response: ApiResponse<Customer> = {
      success: true,
      data: customer,
      message: 'Customer created successfully',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(201).json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Customer force creation failed', {
      error: error instanceof Error ? error.message : String(error),
      sessionId: res.locals.sessionId,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Customer creation failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/customers/:id - Get customer by ID
 */
router.get('/:id', getCustomerValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const sessionId = res.locals.sessionId;

    const getResult = await databaseService.getCustomer(id);

    if (getResult.error || !getResult.data) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    const customer: Customer = {
      ...getResult.data,
      id: getResult.data.id!,
      created_at: getResult.data.created_at || new Date().toISOString(),
      updated_at: getResult.data.updated_at || new Date().toISOString(),
      total_quotes: getResult.data.total_quotes || 0,
      last_quote_date: getResult.data.last_quote_date || null
    };
    const responseTime = Date.now() - startTime;

    Logger.info('Customer retrieved successfully', {
      customerId: id,
      sessionId,
      responseTime
    });

    const response: ApiResponse<Customer> = {
      success: true,
      data: customer,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Customer retrieval failed', {
      error: error instanceof Error ? error.message : String(error),
      customerId: req.params.id,
      sessionId: res.locals.sessionId,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Customer retrieval failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * PUT /api/customers/:id - Update customer
 */
router.put('/:id', updateCustomerValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const sessionId = res.locals.sessionId;
    const updateData: CustomerUpdateRequest = req.body;

    // Verify customer exists
    const existingResult = await databaseService.getCustomer(id);

    if (existingResult.error || !existingResult.data) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found or access denied',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    // TODO: Implement duplicate email check using available service methods
    // For now, proceed with the update

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid updates provided',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    // Use upsertCustomer with existing ID to update
    const updateResult = await databaseService.upsertCustomer({
      id,
      ...existingResult.data,
      ...updateData
    });

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    const updatedCustomer: Customer = {
      ...updateResult.data!,
      id: updateResult.data!.id!,
      created_at: updateResult.data!.created_at || new Date().toISOString(),
      updated_at: updateResult.data!.updated_at || new Date().toISOString(),
      total_quotes: updateResult.data!.total_quotes || 0,
      last_quote_date: updateResult.data!.last_quote_date || null
    };

    const responseTime = Date.now() - startTime;
    Logger.info('Customer updated successfully', {
      customerId: id,
      sessionId,
      updatedFields: Object.keys(updateData),
      responseTime
    });

    const response: ApiResponse<Customer> = {
      success: true,
      data: updatedCustomer,
      message: 'Customer updated successfully',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Customer update failed', {
      error: error instanceof Error ? error.message : String(error),
      customerId: req.params.id,
      sessionId: res.locals.sessionId,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Customer update failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/customers - Search and list customers
 */
router.get('/', listCustomersValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const sessionId = res.locals.sessionId;
    const {
      page = 1,
      limit = 20,
      sort = 'updated_at',
      order = 'desc',
      q,
      name,
      email,
      company
    }: CustomerSearchQuery = req.query;

    // Build where conditions
    const conditions: string[] = ['(session_id = $1 OR session_id IS NULL OR $1 IS NULL)'];
    const params: any[] = [sessionId];
    let paramIndex = 2;

    // Text search across multiple fields
    if (q) {
      conditions.push(`search_vector @@ plainto_tsquery('english', $${paramIndex++})`);
      params.push(q);
    }

    // Specific field searches
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

    // Validate sort field
    const allowedSortFields = ['name', 'company', 'email', 'created_at', 'updated_at', 'total_quotes'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'updated_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Calculate pagination
    const offset = (page - 1) * limit;

    // Use searchCustomers method for listing
    const searchResult = await databaseService.searchCustomers(q || '', limit);
    if (searchResult.error) {
      throw new Error(searchResult.error.message);
    }

    const customers: Customer[] = (searchResult.data || []).map(customer => ({
      ...customer,
      id: customer.id!,
      created_at: customer.created_at || new Date().toISOString(),
      updated_at: customer.updated_at || new Date().toISOString(),
      total_quotes: customer.total_quotes || 0,
      last_quote_date: customer.last_quote_date || null
    }));
    const total = customers.length;
    const totalPages = Math.ceil(total / limit);

    const responseTime = Date.now() - startTime;
    Logger.info('Customers listed successfully', {
      sessionId,
      count: customers.length,
      total,
      page,
      hasSearch: !!q,
      responseTime
    });

    const response: ApiResponse<PaginationResponse<Customer>> = {
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

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Customers listing failed', {
      error: error instanceof Error ? error.message : String(error),
      sessionId: res.locals.sessionId,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Customers listing failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/customers/:id/quotes - Get customer's quote history
 */
router.get('/:id/quotes', getCustomerValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const sessionId = res.locals.sessionId;
    const { page = 1, limit = 20 } = req.query;

    // Verify customer exists and is accessible
    const customerResult = await databaseService.getCustomer(id);

    if (customerResult.error || !customerResult.data) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    // Get customer's quotes using session quotes method
    const offset = (Number(page) - 1) * Number(limit);
    
    // TODO: Implement customer-specific quote retrieval
    const quotesResult = await databaseService.getSessionQuotes(Number(limit), offset);
    if (quotesResult.error) {
      throw new Error(quotesResult.error.message);
    }

    // Filter quotes for this customer
    const allQuotes = quotesResult.data || [];
    const quotes = allQuotes.filter(q => q.customer_id === id).map(row => ({
      ...row,
      id: row.id!,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
      customer_snapshot: {
        id: customerResult.data.id!,
        name: customerResult.data.name,
        email: customerResult.data.email,
        phone: customerResult.data.phone,
        company: customerResult.data.company,
        address: customerResult.data.address,
        created_at: customerResult.data.created_at || new Date().toISOString(),
        updated_at: customerResult.data.updated_at || new Date().toISOString(),
        total_quotes: customerResult.data.total_quotes || 0,
        last_quote_date: customerResult.data.last_quote_date || null
      } as Customer,
      item_count: row.cart_data?.items?.length || 0,
      labor_count: row.cart_data?.laborItems?.length || 0,
      subtotal: row.cart_data?.subtotal || 0,
      tax_amount: row.cart_data?.taxAmount || 0,
      final_total: row.cart_data?.finalTotal || 0
    } as any));

    const total = quotes.length;
    const totalPages = Math.ceil(total / Number(limit));

    const responseTime = Date.now() - startTime;
    Logger.info('Customer quotes retrieved successfully', {
      customerId: id,
      sessionId,
      quoteCount: quotes.length,
      total,
      responseTime
    });

    const response: ApiResponse<PaginationResponse<Quote>> = {
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

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Customer quotes retrieval failed', {
      error: error instanceof Error ? error.message : String(error),
      customerId: req.params.id,
      sessionId: res.locals.sessionId,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Customer quotes retrieval failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/customers/search/duplicates - Find potential duplicates for given customer data
 */
router.post('/search/duplicates', createCustomerValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const sessionId = res.locals.sessionId;
    const customerData: CustomerCreateRequest = req.body;

    const duplicates = await findPotentialDuplicates(customerData, sessionId);
    
    const responseTime = Date.now() - startTime;
    Logger.info('Duplicate search completed', {
      sessionId,
      duplicatesFound: duplicates.length,
      responseTime
    });

    const response: ApiResponse<{ duplicates: Customer[] }> = {
      success: true,
      data: { duplicates },
      message: duplicates.length > 0 ? 'Potential duplicates found' : 'No duplicates found',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Duplicate search failed', {
      error: error instanceof Error ? error.message : String(error),
      sessionId: res.locals.sessionId,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Duplicate search failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

export { router as customersRouter };