// ALVA POS MVP - Database Management Routes
// API endpoints for database operations, migrations, and maintenance

import { Router, Request, Response } from 'express';
import { databaseService, DatabaseService } from '@/services/DatabaseService';
import { migrationManager } from '@/database/MigrationManager';
import { sessionMiddleware } from '@/middleware/sessionMiddleware';
import { Logger } from '@/utils/logger';

const router = Router();

// Apply session middleware to all database routes
router.use(sessionMiddleware);

// Extend Request interface to include database service
interface DatabaseRequest extends Request {
  db?: DatabaseService;
}

// Middleware to initialize database service with session
router.use((req: DatabaseRequest, res: Response, next) => {
  if (req.sessionId) {
    databaseService.setSession(req.sessionId);
    req.db = databaseService;
  }
  next();
});

// ====================================
// HEALTH & STATUS ENDPOINTS
// ====================================

/**
 * Database health check
 * GET /api/database/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await databaseService.healthCheck();
    
    res.status(health.healthy ? 200 : 503).json({
      success: health.healthy,
      ...health.details
    });
  } catch (error) {
    Logger.error('Database health check failed', error);
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Database statistics
 * GET /api/database/stats
 */
router.get('/stats', async (req: DatabaseRequest, res: Response) => {
  try {
    const { data: stats, error } = await req.db!.getDatabaseStats();
    
    if (error) {
      throw new Error(error.message || 'Failed to get database stats');
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    Logger.error('Failed to get database stats', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Migration status
 * GET /api/database/migrations/status
 */
router.get('/migrations/status', async (req: Request, res: Response) => {
  try {
    const status = await migrationManager.getMigrationStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    Logger.error('Failed to get migration status', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ====================================
// MIGRATION MANAGEMENT
// ====================================

/**
 * Run pending migrations
 * POST /api/database/migrations/run
 */
router.post('/migrations/run', async (req: Request, res: Response) => {
  try {
    // Only allow in development or with explicit permission
    if (process.env.NODE_ENV === 'production' && !req.headers['x-allow-migrations']) {
      return res.status(403).json({
        success: false,
        error: 'Migration execution not allowed in production'
      });
    }

    const results = await migrationManager.runPendingMigrations();
    const success = results.every(r => r.success);
    
    res.status(success ? 200 : 500).json({
      success,
      results,
      message: success ? 'All migrations completed successfully' : 'Some migrations failed'
    });
  } catch (error) {
    Logger.error('Migration execution failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Migration failed'
    });
  }
});

/**
 * Validate migration integrity
 * GET /api/database/migrations/validate
 */
router.get('/migrations/validate', async (req: Request, res: Response) => {
  try {
    const validation = await migrationManager.getMigrationStatus();
    
    res.json({
      success: validation.upToDate,
      data: validation
    });
  } catch (error) {
    Logger.error('Migration validation failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed'
    });
  }
});

// ====================================
// CUSTOMER OPERATIONS
// ====================================

/**
 * Get or create customer
 * POST /api/database/customers
 */
router.post('/customers', async (req: DatabaseRequest, res: Response) => {
  try {
    const customerData = req.body;
    
    if (!customerData.name) {
      return res.status(400).json({
        success: false,
        error: 'Customer name is required'
      });
    }

    const { data: customer, error } = await req.db!.upsertCustomer(customerData);
    
    if (error) {
      throw new Error(error.message || 'Failed to save customer');
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    Logger.error('Failed to save customer', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save customer'
    });
  }
});

/**
 * Search customers
 * GET /api/database/customers/search?q=query
 */
router.get('/customers/search', async (req: DatabaseRequest, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const { data: customers, error } = await req.db!.searchCustomers(query, limit);
    
    if (error) {
      throw new Error(error.message || 'Search failed');
    }

    res.json({
      success: true,
      data: customers || []
    });
  } catch (error) {
    Logger.error('Customer search failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed'
    });
  }
});

// ====================================
// PRODUCT OPERATIONS
// ====================================

/**
 * Get products with filtering
 * GET /api/database/products
 */
router.get('/products', async (req: DatabaseRequest, res: Response) => {
  try {
    const {
      category,
      search,
      inStockOnly = 'false',
      limit = '100',
      offset = '0'
    } = req.query;

    const { data: products, error } = await req.db!.getProducts(
      category as string,
      search as string,
      inStockOnly === 'true',
      parseInt(limit as string),
      parseInt(offset as string)
    );
    
    if (error) {
      throw new Error(error.message || 'Failed to get products');
    }
console.log('>> Sending products to frontend:', JSON.stringify(products.slice(0, 2), null, 2));

    res.json({
      success: true,
      data: products || []
    });
  } catch (error) {
    Logger.error('Failed to get products', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get products'
    });
  }
});

/**
 * Advanced product search
 * POST /api/database/products/search
 */
router.post('/products/search', async (req: DatabaseRequest, res: Response) => {
  try {
    const {
      query = '',
      filters = {},
      sortBy = 'relevance',
      limit = 50,
      offset = 0
    } = req.body;

    const startTime = Date.now();
    
    const { data: products, error } = await req.db!.searchProducts(
      query,
      filters,
      sortBy,
      limit,
      offset
    );
    
    if (error) {
      throw new Error(error.message || 'Search failed');
    }

    const responseTime = Date.now() - startTime;
    
    // Log search for analytics
    if (req.sessionId && query.trim()) {
      await req.db!.logSearchQuery(
        query,
        'product',
        products?.length || 0,
        responseTime
      );
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
  } catch (error) {
    Logger.error('Product search failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed'
    });
  }
});

/**
 * Get product by ID
 * GET /api/database/products/:id
 */
router.get('/products/:id', async (req: DatabaseRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    
    const { data: product, error } = await req.db!.getProduct(id);
    
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
  } catch (error) {
    Logger.error('Failed to get product', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get product'
    });
  }
});

// ====================================
// QUOTE OPERATIONS
// ====================================

/**
 * Create quote
 * POST /api/database/quotes
 */
// GAK KEPAKE
router.post('/quotes', async (req: DatabaseRequest, res: Response) => {
  try {
    const quoteData = req.body;
    
    // Generate quote number if not provided
    if (!quoteData.quote_number) {
      quoteData.quote_number = await req.db!.generateQuoteNumber();
    }

    const { data: quote, error } = await req.db!.createQuoteAlvamitra(quoteData);
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
  } catch (error) {
    Logger.error('Failed to create quote', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create quote'
    });
  }
});

/**
 * Update quote
 * PATCH /api/database/quotes/:id
 */
router.patch('/quotes/:id', async (req: DatabaseRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Quote ID is required' });
    }
    
    const { data: quote, error } = await req.db!.updateQuote(id, updates);
    
    if (error) {
      throw new Error(error.message || 'Failed to update quote');
    }

    res.json({
      success: true,
      data: quote
    });
  } catch (error) {
    Logger.error('Failed to update quote', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update quote'
    });
  }
});

/**
 * Get session quotes
 * GET /api/database/quotes
 */
router.get('/quotes', async (req: DatabaseRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { data: quotes, error } = await req.db!.getSessionQuotes(limit, offset);
    
    if (error) {
      throw new Error(error.message || 'Failed to get quotes');
    }

    res.json({
      success: true,
      data: quotes || []
    });
  } catch (error) {
    Logger.error('Failed to get quotes', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get quotes'
    });
  }
});

// ====================================
// TEMPLATE OPERATIONS
// ====================================

/**
 * Get templates
 * GET /api/database/templates
 */
router.get('/templates', async (req: DatabaseRequest, res: Response) => {
  try {
    const category = req.query.category as string;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const { data: templates, error } = await req.db!.getTemplates(category, limit);
    
    if (error) {
      throw new Error(error.message || 'Failed to get templates');
    }

    res.json({
      success: true,
      data: templates || []
    });
  } catch (error) {
    Logger.error('Failed to get templates', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get templates'
    });
  }
});

/**
 * Create template
 * POST /api/database/templates
 */
router.post('/templates', async (req: DatabaseRequest, res: Response) => {
  try {
    const templateData = req.body;
    
    if (!templateData.name || !templateData.category) {
      return res.status(400).json({
        success: false,
        error: 'Template name and category are required'
      });
    }

    const { data: template, error } = await req.db!.createTemplate(templateData);
    
    if (error) {
      throw new Error(error.message || 'Failed to create template');
    }

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    Logger.error('Failed to create template', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template'
    });
  }
});

// ====================================
// SEARCH OPERATIONS
// ====================================

/**
 * Global search
 * GET /api/database/search?q=query
 */
router.get('/search', async (req: DatabaseRequest, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 50;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const startTime = Date.now();
    
    const { data: results, error } = await req.db!.globalSearch(query, limit);
    
    if (error) {
      throw new Error(error.message || 'Search failed');
    }

    const responseTime = Date.now() - startTime;
    
    // Log search for analytics
    if (req.sessionId) {
      await req.db!.logSearchQuery(
        query,
        'global',
        results?.length || 0,
        responseTime
      );
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
  } catch (error) {
    Logger.error('Global search failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed'
    });
  }
});

/**
 * Search suggestions
 * GET /api/database/search/suggestions?q=partial
 */
router.get('/search/suggestions', async (req: DatabaseRequest, res: Response) => {
  try {
    const partialQuery = req.query.q as string;
    const type = req.query.type as string || 'all';
    
    if (!partialQuery || partialQuery.trim().length < 1) {
      return res.json({
        success: true,
        data: []
      });
    }

    const { data: suggestions, error } = await req.db!.getSearchSuggestions(partialQuery, type);
    
    if (error) {
      throw new Error(error.message || 'Failed to get suggestions');
    }

    res.json({
      success: true,
      data: suggestions || []
    });
  } catch (error) {
    Logger.error('Search suggestions failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get suggestions'
    });
  }
});

// ====================================
// MAINTENANCE OPERATIONS
// ====================================

/**
 * Cleanup expired sessions
 * POST /api/database/cleanup
 */
router.post('/cleanup', async (req: DatabaseRequest, res: Response) => {
  try {
    const retentionDays = parseInt(req.body.retentionDays) || 7;
    
    const { data: result, error } = await req.db!.cleanupExpiredSessions(retentionDays);
    
    if (error) {
      throw new Error(error.message || 'Cleanup failed');
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    Logger.error('Session cleanup failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Cleanup failed'
    });
  }
});

// Error handling middleware
router.use((error: Error, req: Request, res: Response, next: any) => {
  Logger.error('Database route error', {
    error: error.message,
    path: req.path,
    method: req.method,
    sessionId: (req as any).sessionId
  });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

export default router;