// ALVA POS MVP - Product Catalog API Routes
// TASK-B009: Complete product catalog with advanced search and caching

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { databaseService } from '@/services/DatabaseService';
import { Logger } from '@/utils/logger';
import { 
  ApiResponse, 
  Product, 
  ProductCreateRequest, 
  ProductUpdateRequest, 
  ProductSearchQuery,
  ProductSearchResult,
  PaginationResponse,
  ValidationError
} from '@/types/api';

const router = Router();

// ===========================================
// CACHING SYSTEM
// ===========================================

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

class ProductCache {
  private cache = new Map<string, CacheItem<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly SEARCH_TTL = 2 * 60 * 1000; // 2 minutes for search results
  private readonly CATEGORIES_TTL = 10 * 60 * 1000; // 10 minutes for categories

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + ttl
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item || Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; hitRate?: number } {
    return { size: this.cache.size };
  }

  // Product-specific methods
  invalidateProduct(id?: string): void {
    if (id) {
      this.cache.delete(`product:${id}`);
    }
    this.invalidatePattern('products:.*');
    this.invalidatePattern('search:.*');
    this.cache.delete('categories');
  }

  getCacheKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${prefix}:${sortedParams}`;
  }
}

const productCache = new ProductCache();

// ===========================================
// HELPER FUNCTIONS
// ===========================================

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

/**
 * Build advanced search query with ranking
 */
function buildSearchQuery(searchTerm: string, filters: ProductSearchQuery): { query: string; params: any[]; paramIndex: number } {
  const conditions: string[] = ['is_active = true'];
  const params: any[] = [];
  let paramIndex = 1;

  // Full-text search with ranking
  if (searchTerm) {
    conditions.push(`(
      search_vector @@ plainto_tsquery('english', $${paramIndex++}) OR
      name_simple ILIKE $${paramIndex++} OR
      description_simple ILIKE $${paramIndex++}
    )`);
    params.push(searchTerm, `%${searchTerm.toLowerCase()}%`, `%${searchTerm.toLowerCase()}%`);
  }

  // Category filter
  if (filters.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(filters.category);
  }

  // Brand filter
  if (filters.brand) {
    conditions.push(`brand ILIKE $${paramIndex++}`);
    params.push(`%${filters.brand}%`);
  }

  // Price range filters
  if (filters.price_min !== undefined) {
    conditions.push(`price >= $${paramIndex++}`);
    params.push(filters.price_min);
  }

  if (filters.price_max !== undefined) {
    conditions.push(`price <= $${paramIndex++}`);
    params.push(filters.price_max);
  }

  // Stock filter
  if (filters.in_stock !== undefined) {
    conditions.push(`in_stock = $${paramIndex++}`);
    params.push(filters.in_stock);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build search ranking
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

/**
 * Fuzzy product matching for BOQ imports
 */
async function fuzzySearchProducts(searchTerm: string, category?: string, limit: number = 10): Promise<ProductSearchResult[]> {
  const cacheKey = `fuzzy:${searchTerm}:${category || 'all'}:${limit}`;
  const cached = productCache.get<ProductSearchResult[]>(cacheKey);
  if (cached) return cached;

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

  // Use searchProducts service method for fuzzy search  
  const searchResult = await databaseService.searchProducts(searchTerm, { category }, 'relevance', limit, 0);
  if (searchResult.error) {
    throw new Error(searchResult.error.message);
  }
  
  const results = searchResult.data || [];
  productCache.set(cacheKey, results, productCache['SEARCH_TTL']);
  return results;
}

// ===========================================
// VALIDATION RULES
// ===========================================

const createProductValidation = [
  body('name').isString().isLength({ min: 1, max: 255 }).withMessage('Product name is required'),
  body('category').isIn(['cameras', 'recorders', 'storage', 'network', 'power', 'accessories']).withMessage('Valid category is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('cost').optional().isFloat({ min: 0 }).withMessage('Cost must be positive'),
  body('sku').optional().isString().isLength({ min: 3, max: 50 }).withMessage('SKU must be 3-50 characters'),
  body('brand').optional().isString().isLength({ max: 100 }),
  body('model').optional().isString().isLength({ max: 100 }),
  body('specifications').optional().isArray().withMessage('Specifications must be an array'),
  handleValidationErrors
];

const updateProductValidation = [
  param('id').isUUID().withMessage('Valid product ID is required'),
  body('name').optional().isString().isLength({ min: 1, max: 255 }),
  body('category').optional().isIn(['cameras', 'recorders', 'storage', 'network', 'power', 'accessories']),
  body('price').optional().isFloat({ min: 0 }),
  body('cost').optional().isFloat({ min: 0 }),
  body('in_stock').optional().isBoolean(),
  body('is_active').optional().isBoolean(),
  handleValidationErrors
];

const searchProductsValidation = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isIn(['cameras', 'recorders', 'storage', 'network', 'power', 'accessories']),
  query('price_min').optional().isFloat({ min: 0 }),
  query('price_max').optional().isFloat({ min: 0 }),
  query('in_stock').optional().isBoolean(),
  handleValidationErrors
];

// ===========================================
// ROUTE HANDLERS
// ===========================================

/**
 * GET /api/products - List products with pagination and filtering
 */
router.get('/', searchProductsValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const {
      page = 1,
      limit = 20,
      sort = 'sort_order',
      order = 'asc',
      category,
      brand,
      price_min,
      price_max,
      in_stock
    }: ProductSearchQuery = req.query;

    // Check cache
    const cacheKey = productCache.getCacheKey('products', req.query as Record<string, any>);
    const cached = productCache.get<PaginationResponse<Product>>(cacheKey);
    if (cached) {
      const response: ApiResponse<PaginationResponse<Product>> = {
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      };
      return res.json(response);
    }

    // Build conditions
    const conditions = ['is_active = true'];
    const params: any[] = [];
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

    // Validate sort field
    const allowedSortFields = ['name', 'category', 'brand', 'price', 'created_at', 'sort_order'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'sort_order';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Calculate pagination
    const offset = (page - 1) * limit;

    // Get products using DatabaseService
    const productsResult = await databaseService.getProducts(
      category,
      brand, // Use brand as search term if provided
      in_stock,
      limit,
      offset
    );

    if (productsResult.error) {
      throw new Error(productsResult.error.message);
    }

    const products: Product[] = (productsResult.data || []).map(product => {
  // const stock_by_warehouse = (product.stock_by_warehouse || []).map(w => ({
  //   warehouse: w.warehouse,
  //   quantity: w.stock,
  //   status: w.stock > 0 ? 'Ready' : 'Out of Stock'
  // }));

  return {
    ...product,
    created_at: (product as any).created_at || new Date().toISOString(),
    updated_at: (product as any).updated_at || new Date().toISOString(),
    specifications: (product.specifications || []).map(spec =>
      typeof spec === 'string'
        ? { name: spec, value: '' }
        : spec
    )
  };
});

    const total = products.length; // TODO: Get accurate total count from service
    const totalPages = Math.ceil(total / limit);

    const responseTime = Date.now() - startTime;
    Logger.info('Products listed successfully', {
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

    // Cache the result
    productCache.set(cacheKey, paginationData);

    const response: ApiResponse<PaginationResponse<Product>> = {
      success: true,
      data: paginationData,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Products listing failed', {
      error: error instanceof Error ? error.message : String(error),
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Products listing failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/products/search - Advanced search with fuzzy matching
 */
router.get('/search', searchProductsValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const {
      q,
      page = 1,
      limit = 20,
      category,
      brand,
      price_min,
      price_max,
      in_stock,
      fuzzy = false
    } = req.query as ProductSearchQuery & { fuzzy?: boolean };

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    // Check cache
    const cacheKey = productCache.getCacheKey('search', { q, ...req.query } as Record<string, any>);
    const cached = productCache.get<PaginationResponse<ProductSearchResult>>(cacheKey);
    if (cached) {
      const response: ApiResponse<PaginationResponse<ProductSearchResult>> = {
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      };
      return res.json(response);
    }

    let products: ProductSearchResult[];

    if (fuzzy) {
      // Fuzzy search for BOQ matching
      products = await fuzzySearchProducts(q as string, category as string, limit);
    } else {
      // Advanced search with ranking
      const { query, params, paramIndex } = buildSearchQuery(q as string, {
        category,
        brand,
        price_min,
        price_max,
        in_stock
      } as ProductSearchQuery);

      // Add pagination
      const offset = (page - 1) * limit;
      const paginatedQuery = `${query} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const searchResult = await databaseService.searchProducts(q as string, {
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

    // For regular search, get total count
    let total = products.length;
    let totalPages = 1;

    if (!fuzzy) {
      // TODO: Implement accurate count from searchProducts service method
      // For now, estimate based on results
      total = products.length;
      totalPages = Math.ceil(total / limit);
    }

    const responseTime = Date.now() - startTime;
    Logger.info('Product search completed', {
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

    // Cache results
    productCache.set(cacheKey, paginationData, productCache['SEARCH_TTL']);

    const response: ApiResponse<PaginationResponse<ProductSearchResult>> = {
      success: true,
      data: paginationData,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Product search failed', {
      error: error instanceof Error ? error.message : String(error),
      query: req.query.q,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Product search failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/products/categories - Get product categories with counts
 */
router.get('/categories', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Check cache
    const cached = productCache.get<any[]>('categories');
    if (cached) {
      const response: ApiResponse<any[]> = {
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      };
      return res.json(response);
    }

    // TODO: Implement getProductCategories method in DatabaseService
    // For now, return static category list
    const categories = [
      { category: 'cameras', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
      { category: 'recorders', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
      { category: 'storage', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
      { category: 'network', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
      { category: 'power', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 },
      { category: 'accessories', total_count: 0, in_stock_count: 0, avg_price: 0, min_price: 0, max_price: 0 }
    ];

    // Cache categories
    productCache.set('categories', categories, productCache['CATEGORIES_TTL']);

    const responseTime = Date.now() - startTime;
    Logger.info('Product categories retrieved', {
      categoriesCount: categories.length,
      responseTime
    });

    const response: ApiResponse<any[]> = {
      success: true,
      data: categories,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Categories retrieval failed', {
      error: error instanceof Error ? error.message : String(error),
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Categories retrieval failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/products/brands - Get product brands with counts and categories
 */
router.get('/brands', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Check cache
    const cached = productCache.get<any[]>('brands');
    if (cached) {
      const response: ApiResponse<any[]> = {
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      };
      return res.json(response);
    }

    // For now, get all products and aggregate brands manually
    // This is a temporary solution until we add a proper getBrands method to DatabaseService
    const productsResult = await databaseService.getProducts();
    
    if (productsResult.error) {
      throw new Error(productsResult.error.message);
    }

    const products = productsResult.data || [];
    
    // Aggregate brands from products
    const brandMap = new Map();
    
    products.forEach((product: any) => {
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
    
    // Convert to array and calculate price statistics
    const brands = Array.from(brandMap.values()).map((brandData: any) => {
      const prices = brandData.prices.sort((a: number, b: number) => a - b);
      return {
        brand: brandData.brand,
        count: brandData.count,
        categories: Array.from(brandData.categories),
        in_stock_count: brandData.in_stock_count,
        avg_price: prices.length > 0 ? Math.round((prices.reduce((sum: number, price: number) => sum + price, 0) / prices.length) * 100) / 100 : 0,
        min_price: prices.length > 0 ? prices[0] : 0,
        max_price: prices.length > 0 ? prices[prices.length - 1] : 0
      };
    }).sort((a, b) => a.brand.localeCompare(b.brand));

    // Cache brands for 10 minutes
    productCache.set('brands', brands, productCache['CATEGORIES_TTL']);

    const responseTime = Date.now() - startTime;
    Logger.info('Product brands retrieved', {
      brandsCount: brands.length,
      responseTime
    });

    const response: ApiResponse<any[]> = {
      success: true,
      data: brands,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Brands retrieval failed', {
      error: error instanceof Error ? error.message : String(error),
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Brands retrieval failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/products/:id - Get product by ID
 */
router.get('/:id', [param('id').isUUID().withMessage('Valid product ID is required'), handleValidationErrors], async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;

    // Check cache
    const cacheKey = `product:${id}`;
    const cached = productCache.get<Product>(cacheKey);
    if (cached) {
      const response: ApiResponse<Product> = {
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      };
      return res.json(response);
    }

    const getResult = await databaseService.getProduct(id);

    if (getResult.error || !getResult.data) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    const product: Product = {
      ...getResult.data,
      created_at: (getResult.data as any).created_at || new Date().toISOString(),
      updated_at: (getResult.data as any).updated_at || new Date().toISOString(),
      specifications: (getResult.data.specifications || []).map(spec => 
        typeof spec === 'string' 
          ? { name: spec, value: '' }
          : spec
      )
    };

    // Cache the product
    productCache.set(cacheKey, product);

    const responseTime = Date.now() - startTime;
    Logger.info('Product retrieved successfully', {
      productId: id,
      responseTime
    });

    const response: ApiResponse<Product> = {
      success: true,
      data: product,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Product retrieval failed', {
      error: error instanceof Error ? error.message : String(error),
      productId: req.params.id,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Product retrieval failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * POST /api/products - Add new product (admin only)
 */
router.post('/', createProductValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const productData: ProductCreateRequest = req.body;

    // TODO: Implement createProduct method in DatabaseService
    // For now, return error indicating feature not implemented
    return res.status(501).json({
      success: false,
      error: 'Product creation not implemented',
      message: 'Product creation requires DatabaseService.createProduct method',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });

    // This code would be executed after successful product creation

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Product creation failed', {
      error: error instanceof Error ? error.message : String(error),
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Product creation failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * PUT /api/products/:id - Update product (admin only)
 */
router.put('/:id', updateProductValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const updateData: ProductUpdateRequest = req.body;

    // Check product exists
    const existingResult = await databaseService.getProduct(id);

    if (existingResult.error || !existingResult.data) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    // TODO: Implement updateProduct method in DatabaseService
    // For now, return error indicating feature not implemented
    return res.status(501).json({
      success: false,
      error: 'Product update not implemented',
      message: 'Product update requires DatabaseService.updateProduct method',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });

    // This code would be executed after successful product update

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Product update failed', {
      error: error instanceof Error ? error.message : String(error),
      productId: req.params.id,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Product update failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/products/cache/stats - Get cache statistics (debug endpoint)
 */
router.get('/cache/stats', (req: Request, res: Response) => {
  const stats = productCache.getStats();
  
  const response: ApiResponse<any> = {
    success: true,
    data: stats,
    timestamp: new Date().toISOString(),
    requestId: res.locals.requestId
  };

  res.json(response);
});

/**
 * DELETE /api/products/cache - Clear product cache (admin endpoint)
 */
router.delete('/cache', (req: Request, res: Response) => {
  productCache.clear();
  
  const response: ApiResponse = {
    success: true,
    message: 'Product cache cleared successfully',
    timestamp: new Date().toISOString(),
    requestId: res.locals.requestId
  };

  res.json(response);
});

export { router as productsRouter };