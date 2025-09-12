// ALVA POS MVP - Database Service
// Comprehensive database operations with session-based data isolation using PostgreSQL

import { db } from '@/config/database';
import { Logger } from '@/utils/logger';
import { readFileSync } from 'fs';
import { join } from 'path';
import { poolAlvamitra, poolSmartjmp } from '../middleware/database';

// Type definitions
export interface Customer {
  id?: string;
  session_id?: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  last_quote_date?: string;
  total_quotes?: number;
}

export interface Product {
  id: string;
  sku?: string;
  name: string;
  category: 'cameras' | 'recorders' | 'storage' | 'network' | 'power' | 'accessories';
  subcategory?: string;
  price: number;
  cost?: number;
  in_stock: boolean;
  description?: string;
  specifications?: string[];
  brand?: string;
  model?: string;
  image_url?: string;
  is_active: boolean;
  sort_order: number;
  stock?: number;
  stock_by_warehouse: Array<{
    warehouse: string;
    quantity: number;
    status: string;
  }>;
  tax: number;
}

export interface Quote {
  id?: string;
  session_id?: string;
  quote_number: string;
  customer_id?: string;
  organisasi_kode?: string;
  nomor_whatsapp?: string;
  cart_data: {
    items: any[];
    laborItems: any[];
    subtotal: number;
    taxAmount: number;
    finalTotal: number;
    totalDiscount?: any;
  };
  customer_snapshot: Record<string, any>;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  tax_rate: number;
  source: 'fresh' | 'boq' | 'template';
  template_id?: string;
  boq_import_id?: string;
  created_at?: string;
  updated_at?: string;
  valid_until?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface Template {
  id?: string;
  session_id?: string;
  name: string;
  description?: string;
  category: string;
  template_data: {
    items: any[];
    laborItems: any[];
    totalDiscount?: any;
  };
  tags: string[];
  is_public: boolean;
  usage_count?: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string;
}

export interface BOQImport {
  id?: string;
  session_id: string;
  filename: string;
  original_filename: string;
  file_size?: number;
  mime_type?: string;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  processing_progress: number;
  error_message?: string;
  total_items?: number;
  matched_items?: number;
  unmatched_items?: number;
  import_data?: Record<string, any>;
  uploaded_at?: string;
  processed_at?: string;
}

export interface SearchResult {
  entity_type: 'product' | 'customer' | 'quote' | 'template';
  entity_id: string;
  title: string;
  description: string;
  category: string;
  search_rank: number;
  metadata: Record<string, any>;
}

export interface DatabaseStats {
  tables: {
    customers: number;
    products: number;
    quotes: number;
    templates: number;
    boq_imports: number;
  };
  session_stats: {
    active_sessions: number;
    quotes_today: number;
    templates_used_today: number;
  };
  performance: {
    avg_query_time: number;
    cache_hit_rate: number;
    index_usage: number;
  };
}

export class DatabaseService {
  private sessionId: string | null = null;

  constructor() {
    // No client initialization needed with pure PostgreSQL
  }

  /**
   * Set session context for all subsequent operations
   */
  setSession(sessionId: string): void {
    this.sessionId = sessionId;
    Logger.debug('Database session set', { sessionId: sessionId.substring(0, 8) + '...' });
  }

  /**
   * Clear session context
   */
  clearSession(): void {
    this.sessionId = null;
    Logger.debug('Database session cleared');
  }

  /**
   * Execute query with session context
   */
  private async executeWithSession<T>(
    queryText: string,
    values?: any[],
    context?: string
  ): Promise<{ data: T[] | null; error: any }> {
    if (!this.sessionId) {
      Logger.warn('Executing query without session context', { context });
      return db.execute<T>(queryText, values, context);
    }

    return db.query<T>(this.sessionId, queryText, values, context);
  }

  /**
   * Initialize database schema and migrations
   */
  async initializeDatabase(): Promise<{ success: boolean; error?: string }> {
    try {
      Logger.info('Starting database initialization...');

      // Test basic connectivity
      const connectionTest = await db.test();
      if (!connectionTest) {
        return { 
          success: false, 
          error: 'Database connection test failed' 
        };
      }

      // Check if core tables exist
      const coreTableExists = await this.checkCoreTablesExist();
      
      if (!coreTableExists) {
        Logger.info('Core tables do not exist, attempting to create schema...');
        
        try {
          // Run migrations
          await this.runMigration('001_initial_schema');
          await this.runMigration('002_security_policies');
          await this.runMigration('003_search_optimization');
        } catch (migrationError) {
          Logger.warn('Migration execution failed, database may need manual setup', {
            error: migrationError instanceof Error ? migrationError.message : String(migrationError)
          });
          return { 
            success: false, 
            error: `Schema creation failed: ${migrationError instanceof Error ? migrationError.message : 'Unknown error'}` 
          };
        }
      }

      Logger.info('Database initialization completed successfully');
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Database initialization failed', { error: errorMessage });
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  }

  /**
   * Check if core application tables exist
   */
  private async checkCoreTablesExist(): Promise<boolean> {
    try {
      const { data, error } = await db.execute<{ exists: boolean }>(
        'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) as exists',
        ['public', 'products'],
        'check_core_tables'
      );
      
      return !error && data && data.length > 0 && data[0].exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Run a specific migration
   */
  private async runMigration(migrationName: string): Promise<void> {
    try {
      const migrationPath = join(__dirname, '../database/migrations', `${migrationName}.sql`);
      
      // Check if migration file exists
      try {
        const migrationSQL = readFileSync(migrationPath, 'utf8');
        
        // Execute migration SQL directly
        const { error } = await db.execute(migrationSQL, [], `migration_${migrationName}`);

        if (error) {
          throw new Error(`Migration ${migrationName} failed: ${error.message}`);
        }

        Logger.info(`Migration ${migrationName} executed successfully`);
        
      } catch (fileError) {
        // Migration file might not exist, which is acceptable
        if (fileError instanceof Error && fileError.message.includes('ENOENT')) {
          Logger.debug(`Migration file ${migrationName}.sql not found - skipping`);
        } else {
          throw fileError;
        }
      }

    } catch (error) {
      Logger.warn(`Migration ${migrationName} could not be executed`, {
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - allow server to continue with limited functionality
    }
  }

  // ====================================
  // CUSTOMER OPERATIONS
  // ====================================

  /**
   * Create or update customer
   */
  async upsertCustomer(customer: Customer): Promise<{ data: Customer | null; error: any }> {
    const customerData = {
      ...customer,
      session_id: this.sessionId,
      updated_at: new Date().toISOString(),
    };

    if (customer.id) {
      // Update existing customer
      const { data, error } = await this.executeWithSession<Customer>(
        `UPDATE customers 
        SET name = $2, email = $3, phone = $4, company = $5, address = $6, updated_at = $7
        WHERE id = $1 AND session_id = $8
        RETURNING *`,
        [
          customer.id,
          customerData.name,
          customerData.email,
          customerData.phone || '',          // safe default
          customerData.company || '',        // safe default
          JSON.stringify(customerData.address),
          customerData.updated_at,
          this.sessionId
        ],
        'upsert_customer_update'
      );
      return { data: data && data.length > 0 ? data[0] : null, error };
    } else {
      // Create new customer
      const { data, error } = await this.executeWithSession<Customer>(
        `INSERT INTO customers (
          session_id, name, email, phone, company, address, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          this.sessionId,
          customerData.name,
          customerData.email,
          customerData.phone || '',          // safe default
          customerData.company || '',        // safe default
          JSON.stringify(customerData.address),
          new Date().toISOString(),          // created_at
          customerData.updated_at            // updated_at
        ],
        'upsert_customer_create'
      );
      return { data: data && data.length > 0 ? data[0] : null, error };
    }
  }


  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<{ data: Customer | null; error: any }> {
    const { data, error } = await this.executeWithSession<Customer>(
      'SELECT * FROM customers WHERE id = $1 AND session_id = $2',
      [customerId, this.sessionId],
      'get_customer'
    );

    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  /**
   * Search customers
   */
  async searchCustomers(query: string, limit = 20): Promise<{ data: Customer[]; error: any }> {
    try {
      let sql = `
        SELECT 
          Id_Pengguna,
          CONCAT(Nama_Depan, ' ', Nama_Belakang) AS name,
          Email AS email,
          Nomor_Telpon AS phone,
          Perusahaan AS company,
          Alamat AS street,
          Kota AS city,
          Provinsi AS state,
          Kode_Pos AS postal_code,
          Waktu_Terakhir_Login AS last_quote_date,
          0 AS total_quotes
        FROM tb_data_pengguna
        WHERE Status = 'Aktif'
      `;
      const params: any[] = [];

      if (query) {
        sql += `
          AND (
            Nama_Depan LIKE ? OR
            Nama_Belakang LIKE ? OR
            Email LIKE ? OR
            Nomor_Telpon LIKE ? OR
            Perusahaan LIKE ?
          )
        `;
        const like = `%${query}%`;
        params.push(like, like, like, like, like);
      }

      sql += ` ORDER BY Waktu_Terakhir_Login DESC LIMIT ?`;
      params.push(Number(limit)); // <- fix disini

      console.log('[searchCustomers] SQL:', sql);
      console.log('[searchCustomers] Params:', params);

      const [rows] = await poolAlvamitra.query(sql, params);

      console.log('[searchCustomers] Raw rows:', rows);

      // 🔹 Map ke type Customer
      const data: Customer[] = (rows as any[]).map(r => ({
        id: r.Id_Pengguna,
        organisasi_kode: r.Organisasi_Kode,
        name: r.name,
        email: r.email,
        phone: r.phone,
        company: r.company,
        address: {
          street: r.street,
          city: r.city,
          state: r.state,
          postal_code: r.postal_code,
        },
        last_quote_date: r.last_quote_date,
        total_quotes: r.total_quotes,
      }));

      console.log('[searchCustomers] Mapped data:', data);

      return { data, error: null };
    } catch (error) {
      console.error('[searchCustomers] Error:', error);
      return { data: [], error };
    }
  }

  // ====================================
  // CATEGORY OPERATIONS
  // ====================================
  /**
   * Get all product categories
   */
  async getCategories(parentId?: string) {
    try {
      let sql = `
        SELECT Id_Kategori, Kategori AS Nama_Kategori, Deskripsi_Kategori, Induk_Kategori
        FROM tb_store_produk_kategori
        WHERE 1=1
      `;
      const params: any[] = [];

      // Kalau mau filter hanya kategori anak dari parent tertentu
      if (parentId) {
        sql += ' AND Induk_Kategori = ?';
        params.push(parentId);
      }

      sql += ' ORDER BY Kategori ASC';

      const [rows] = await poolAlvamitra.query(sql, params);

      const categories = (rows as any[]).map(row => ({
        id: row.Id_Kategori,
        name: row.Nama_Kategori,
        description: row.Deskripsi_Kategori,
        parent_id: row.Induk_Kategori,
      }));

      console.log("=== FINAL CATEGORIES ===");
      // console.log(JSON.stringify(categories, null, 2));

      return { data: categories };
    } catch (error) {
      Logger.error('Error fetching categories from MySQL', error);
      console.error('🔥 MySQL Query Error:', error);
      return { data: null, error: error as Error };
    }
  }


  // ====================================
  // PRODUCT OPERATIONS
  // ====================================

  /**
   * Get all products with optional filtering
   */
  async getProducts(category?: string, search?: string, inStockOnly?: boolean, limit = 10, offset = 0) {
    try {
      console.log('==================1==================');
      let sql = `
        SELECT Id_Produk, Nama_Produk, SKU, Deskripsi_Produk, Foto, Foto_PNG,
              Id_Kategori, Id_Merek, Status, Harga_Anggota_Spesial, Harga_Anggota,
              Harga_Retail, Stok, Atribut_Produk
        FROM tb_store_produk
        WHERE 1=1 AND Status = 'Aktif'
      `;
      const params: any[] = [];

      if (category) {
        sql += ' AND Id_Kategori = ?';
        params.push(category);
      }
      if (search) {
        sql += ' AND Nama_Produk LIKE ?';
        params.push(`%${search}%`);
      }
      if (inStockOnly) {
        sql += ' AND Stok > 0';
      }

      limit = Math.max(Number(limit) || 10, 1);
      offset = Math.max(Number(offset) || 0, 0);
      sql += ` LIMIT ${limit} OFFSET ${offset}`;

      // 🔹 Query ke db_alvamitra (produk ecommerce)
      const [rowsAlva] = await poolAlvamitra.query(sql, params);

      // Ambil SKU produk untuk sinkronisasi ke inventory
      const skus = (rowsAlva as any[]).map(row => row.SKU).filter(Boolean);
      let inventoryMap: Record<string, any> = {};
      let warehouseStockMap: Record<string, any[]> = {};
     
      if (skus.length > 0) {
        // 🔹 Ambil data stok utama dari inventory item
        const [rowsItem] = await poolSmartjmp.query(
          `SELECT SKU, Id_Item, Nama_Item, Jumlah, Organisasi_Kode 
          FROM tb_v2_inventory_item 
          WHERE Status = 'Aktif' 
            AND Organisasi_Kode = '20190815113219K54579' 
            AND SKU IN (?)`,
          [skus]
        );

        inventoryMap = (rowsItem as any[]).reduce((acc, row) => {
          if (row.SKU) {
            const key = row.SKU.trim().toUpperCase();
            acc[key] = row;
          }
          return acc;
        }, {} as Record<string, any>);
      // console.log('==================rowsItem==================');
      // console.log(rowsItem);

        // 🔹 Ambil stok per gudang
        const itemIds = (rowsItem as any[]).map(r => r.Id_Item);
        if (itemIds.length > 0) {
          const placeholders = itemIds.map(() => '?').join(',');
          const [rowsGudang] = await poolSmartjmp.query(
            `SELECT 
                s.Id_Item,
                SUM(s.Jumlah) AS Jumlah,
                g.Nama_Gudang,
                i.Nama_Item
            FROM tb_v2_inventory_stok_gudang s
            JOIN tb_v2_inventory_gudang g ON s.Id_Gudang = g.Id_Gudang
            JOIN tb_v2_inventory_item i ON s.Id_Item = i.Id_Item
            WHERE s.Id_Item IN (${placeholders})
            GROUP BY s.Id_Item, g.Id_Gudang`,
            itemIds
          );


      //     console.log('==================rowsGudang==================');
      // console.log(rowsGudang);



          warehouseStockMap = (rowsGudang as any[]).reduce((acc, row) => {
            if (!acc[row.Id_Item]) acc[row.Id_Item] = [];
            acc[row.Id_Item].push({
              warehouse: row.Nama_Gudang,
              quantity: Number(row.Jumlah) ?? 0,
              status: (Number(row.Jumlah) ?? 0) > 0 ? 'Ready' : 'Out of Stock',
            });
            return acc;
          }, {} as Record<string, any[]>);
        }
      }

      // Query tax (PPN)
      let sqlTax = 'SELECT Angka_PPN FROM tb_data_ppn WHERE Status = "Aktif" LIMIT 1';
      const [taxRows] = await poolSmartjmp.query(sqlTax);

      let tax = 11; // default
      if ((taxRows as any[]).length > 0) {
        // console.log('==================taxRows==================');
        // console.log(taxRows);
        tax = (taxRows as any[])[0].PPN || 11;
      }

      // Cast rowsAlva ke array
      const allCategoryIds = [
        ...new Set(
          (rowsAlva as any[]).reduce((acc: string[], row: any) => {
            if (row.Id_Kategori) {
              const ids = row.Id_Kategori.split(',').map((id: string) => id.trim());
              acc.push(...ids);
            }
            return acc;
          }, [])
        )
      ];

      // Query semua kategori unik
      const [catRows] = await poolAlvamitra.query(
        `SELECT Id_Kategori, Kategori AS Nama_Kategori, Deskripsi_Kategori, Induk_Kategori 
        FROM tb_store_produk_kategori 
        WHERE Id_Kategori IN (${allCategoryIds.join(',')})`
      );

      // Buat mapping kategori
      const categoryMap: Record<string, string> = {};
        (catRows as any[]).forEach(cat => {
          categoryMap[String(cat.Id_Kategori).trim()] = cat.Nama_Kategori;
        });

      // 🔹 Gabungkan data dari ecommerce + inventory
      const products = await Promise.all(
        (rowsAlva as any[]).map(async (row) => {
          const skuKey = row.SKU ? row.SKU.trim().toUpperCase() : null;
          const inv = skuKey ? inventoryMap[skuKey] : null;

          return {
            id: row.Id_Produk,
            sku: row.SKU,
            name: row.Nama_Produk,

            categories: row.Id_Kategori
              ? String(row.Id_Kategori)
                  .split(',')
                  .map((id: string) => categoryMap[id.trim()])
                  .filter(Boolean)
              : [],
            // price: row.Harga_Anggota_Spesial ?? 0,
            prices: [
              { type: "Harga_Anggota_Spesial", value: row.Harga_Anggota_Spesial ?? 0 },
              { type: "Harga_Anggota", value: row.Harga_Anggota ?? 0 },
              { type: "Harga_Retail", value: row.Harga_Retail ?? 0 },
            ],
            in_stock: (Number(inv?.Jumlah) ?? row.Stok ?? 0) > 0,
            stock: inv?.Jumlah != null ? Number(inv.Jumlah) : (row.Stok ?? 0),

            stock_by_warehouse: inv && warehouseStockMap[inv.Id_Item] 
              ? warehouseStockMap[inv.Id_Item].map(w => ({
                  warehouse: w.warehouse,
                  quantity: w.quantity ?? 0,
                  status: (w.quantity ?? 0) > 0 ? 'Ready' : 'Out of Stock',
              }))
              : [],

            tax: tax ? Number(tax) : 11,
            description: row.Deskripsi_Produk,
            specifications: row.Atribut_Produk ? row.Atribut_Produk.split(',') : [],
            brand: row.Id_Merek,
            image_url: row.Foto || row.Foto_PNG,
            is_active: row.Status === 'Aktif',
            sort_order: 0
          };
        })
      );


    // console.log("=== FINAL PRODUCTS ===");
    // console.log(JSON.stringify(products, null, 2));

      return { data: products };
    } catch (error) {
      Logger.error('Error fetching products from MySQL', error);
      console.error('🔥 MySQL Query Error:', error);
      return { data: null, error: error as Error };
    }
  }


  /**
   * Get single product by ID
   */
  async getProduct(productId: string) {
    try {
      let sql = 'SELECT * FROM tb_store_produk WHERE Id_Produk = ? AND Status = "Aktif"';
      const params = [productId];

      console.log("📜 SQL Query:", sql);
      console.log("📦 Params:", params);

      const [rows] = await poolAlvamitra.query(sql, params);

      if ((rows as any[]).length === 0) {
        console.log("⚠️ No product found for Id_Produk:", productId);
        return { data: null, error: null };
      }

      const row = (rows as any[])[0];
      const product = {
        id: row.Id_Produk,
        name: row.Nama_Produk,
        category: row.Id_Kategori,
        prices: [
          { type: "Harga_Anggota_Spesial", value: row.Harga_Anggota_Spesial ?? 0 },
          { type: "Harga_Anggota", value: row.Harga_Anggota ?? 0 },
          { type: "Harga_Retail", value: row.Harga_Retail ?? 0 },
        ],
        in_stock: row.Stok > 0,
        description: row.Deskripsi_Produk,
        specifications: row.Atribut_Produk ? row.Atribut_Produk.split(',') : [],
        brand: row.Id_Merek,
        image_url: row.Foto || row.Foto_PNG,
        is_active: row.Status === 'Aktif',
        sort_order: row.Sort_Order || 0
      };

      console.log("✅ Product fetched:", product.id);
      return { data: product, error: null };
    } catch (error) {
      Logger.error("Error fetching product from MySQL", error);
      console.error("🔥 MySQL Query Error:", error);
      return { data: null, error: error as Error };
    }
  }


  

  /**
   * Advanced product search with fuzzy matching
   */
  async searchProducts(
    query: string,
    filters: {
      category?: string;
      brand?: string;
      priceMin?: number;
      priceMax?: number;
      inStockOnly?: boolean;
    } = {},
    sortBy = 'relevance',
    limit = 50,
    offset = 0
  ): Promise<{ data: any[] | null; error: any }> {
    let queryText = `
      SELECT *, 
             CASE 
               WHEN name ILIKE $1 THEN 1
               WHEN description ILIKE $1 THEN 0.8
               WHEN brand ILIKE $1 THEN 0.6
               ELSE 0.4
             END as relevance_score
      FROM products 
      WHERE is_active = true 
        AND (name ILIKE $1 OR description ILIKE $1 OR brand ILIKE $1 OR sku ILIKE $1)
    `;
    const queryParams: any[] = [`%${query}%`];
    let paramCount = 1;

    if (filters.category) {
      paramCount++;
      queryText += ` AND category = $${paramCount}`;
      queryParams.push(filters.category);
    }

    if (filters.brand) {
      paramCount++;
      queryText += ` AND brand ILIKE $${paramCount}`;
      queryParams.push(`%${filters.brand}%`);
    }

    if (filters.priceMin) {
      paramCount++;
      queryText += ` AND price >= $${paramCount}`;
      queryParams.push(filters.priceMin);
    }

    if (filters.priceMax) {
      paramCount++;
      queryText += ` AND price <= $${paramCount}`;
      queryParams.push(filters.priceMax);
    }

    if (filters.inStockOnly) {
      queryText += ` AND in_stock = true`;
    }

    // Sort by relevance or other criteria
    if (sortBy === 'relevance') {
      queryText += ` ORDER BY relevance_score DESC, name`;
    } else if (sortBy === 'price_asc') {
      queryText += ` ORDER BY price ASC`;
    } else if (sortBy === 'price_desc') {
      queryText += ` ORDER BY price DESC`;
    } else {
      queryText += ` ORDER BY name`;
    }

    queryText += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limit, offset);

    const { data, error } = await this.executeWithSession(
      queryText,
      queryParams,
      'search_products_advanced'
    );

    return { data: data || [], error };
  }

  // ====================================
  // QUOTE OPERATIONS
  // ====================================

  /**
   * Create new quote
   */
  // async createQuote(quote: Omit<Quote, 'id'>): Promise<{ data: Quote | null; error: any }> {
  //   const { data, error } = await this.executeWithSession<Quote>(
  //     `INSERT INTO quotes (
  //       session_id, quote_number, cart_data, customer_snapshot, 
  //       status, tax_rate, source, template_id, boq_import_id, created_at, 
  //       updated_at, valid_until, notes, metadata
  //     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, $14)
  //     RETURNING *`,
  //     [
  //       this.sessionId,
  //       quote.quote_number,
  //       // quote.customer_id,
  //       JSON.stringify(quote.cart_data),
  //       // JSON.stringify(quote.customer_snapshot),
  //       quote.status,
  //       quote.tax_rate,
  //       quote.source,
  //       quote.template_id,
  //       quote.boq_import_id,
  //       new Date().toISOString(),
  //       quote.valid_until,
  //       quote.notes,
  //       JSON.stringify(quote.metadata)
  //     ],
  //     'create_quote'
  //   );

  //   return { data: data && data.length > 0 ? data[0] : null, error };
  // }

  async createQuoteAlvamitra(
    quote: {
      quote_number: string;
      id_pengguna: string;
      organisasi_kode: string;
      nomor_whatsapp?: string;
      cart_data: any; // items & laborItems
      notes?: string;
      tax_rate?: number;
    }
  ): Promise<{ data: any | null; error: any }> {
    const connection = await poolAlvamitra.getConnection();
    try {
      console.log('====================================');
      console.log('QUOTE OPERATIONS');
      console.log('====================================');

      await connection.beginTransaction();
      const now = new Date();

      // 1️⃣ Insert ke Master
      const [masterResult] = await connection.query(
        `INSERT INTO tb_store_estimasi_master
          (Nomor_Estimasi, Id_Pengguna, Organisasi_Kode, Note_Quotation, PPN, Waktu_Simpan_Data, Status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          quote.quote_number,
          quote.id_pengguna,
          quote.organisasi_kode,
          quote.notes || '',
          quote.tax_rate || 0,
          now,
          'Aktif'
        ]
      );
      const masterId = (masterResult as any).insertId;

      // 2️⃣ Insert ke Sub (1 sub per master)
      const [subResult] = await connection.query(
        `INSERT INTO tb_store_estimasi_sub
          (Id_Estimasi_Master, Id_Pengguna, Waktu_Simpan_Data, Status)
        VALUES (?, ?, ?, ?)`,
        [masterId, quote.id_pengguna, now, 'Draft']
      );
      const subId = (subResult as any).insertId;

      // 3️⃣ Insert Detail per item cart jika ada
      const items = quote.cart_data?.items || [];
      if (items.length) {
        const insertDetailPromises = items.map((item: any) => {
          return connection.query(
            `INSERT INTO tb_store_estimasi_detail
              (Id_Estimasi_Master, Id_Estimasi_Sub, Id_Produk, Qty, Array_Object_Item_Atribut_Varian, Tipe_Produk, Nama_Produk, Deskripsi_Produk, Harga_Produk, Harga_Produk_Setelah_Diskon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              masterId,
              subId,
              item.productId,
              item.quantity,
              JSON.stringify(item.specs || {}),
              item.tipeProduk || 'Barang',
              item.name,
              item.notes || '',
              item.price,
              item.total
            ]
          );
        });
        await Promise.all(insertDetailPromises);
      }

      // Commit transaksi
      await connection.commit();

      // Return data sukses
      // return { data: { masterId, subId }, error: null };
      // console.log('Quote creation result:', { data: { masterId, subId, items }, error: null });
      console.log('====================================');
      console.log('END OPERATIONS');
      console.log('====================================');
      return { data: { masterId, subId, items }, error: null };

    } catch (err) {
      // Rollback jika gagal
      await connection.rollback();
      console.error("Database error createQuoteAlvamitra:", err);
      return { data: null, error: err };
    } finally {
      // Release connection selalu dijalankan
      connection.release();
    }
  }

  async createOrderAlvamitra(
    order: {
      quote_number: string;
      id_pengguna: string;
      organisasi_kode: string;
      nomor_whatsapp?: string;
      cart_data: any; // items & laborItems
      notes?: string;
      tax_rate?: number;
    }
  ): Promise<{ data: any | null; error: any }> {
    const connection = await poolAlvamitra.getConnection();
    try {
      console.log('====================================');
      console.log('ORDER OPERATIONS');
      console.log('====================================');

      await connection.beginTransaction();
      const now = new Date();

      // 1️⃣ Insert ke MASTER
      const [masterResult] = await connection.query(
        `INSERT INTO tb_store_transaksi_master
          (Nomor_Order, Id_Pengguna, Organisasi_Kode, Id_Pengguna_SMARTJMP, Organisasi_Kode_SMARTJMP,
          Id_Account, Id_Call, Id_Pembayaran, Id_Kupon, Status_Order, Sub_Status_Order,
          Tanggal_Order, PPN, Id_Kode_Promo, Redeem_Order, Sub_Total_Pembelian,
          PPN_Total_Pembelian, Promo_Total_Pembelian, Harga_Total_Pembelian,
          Waktu_Simpan_Data, Status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order.quote_number,                 // Nomor_Order
          order.id_pengguna,                  // Id_Pengguna
          order.organisasi_kode,              // Organisasi_Kode
          0,                                  // Id_Pengguna_SMARTJMP (default 0)
          '',                                 // Organisasi_Kode_SMARTJMP (default kosong)
          null,                               // Id_Account
          null,                               // Id_Call
          0,                                  // Id_Pembayaran (default 0)
          null,                               // Id_Kupon
          'Draft',                            // Status_Order
          'Pending',                          // Sub_Status_Order
          now,                                // Tanggal_Order
          String(order.tax_rate || 0),        // PPN (text field!)
          0,                                  // Id_Kode_Promo
          0,                               // Redeem_Order
          '0',                                // Sub_Total_Pembelian
          '0',                                // PPN_Total_Pembelian
          '0',                                // Promo_Total_Pembelian
          '0',                                // Harga_Total_Pembelian
          now,                                // Waktu_Simpan_Data
          'Aktif'                             // Status
        ]
      );
      const masterId = (masterResult as any).insertId;

      // 2️⃣ Insert ke SUB
      const [subResult] = await connection.query(
        `INSERT INTO tb_store_transaksi_sub
          (Id_Transaksi_Master, Nomor_Order_Vendor, Id_Vendor, Id_Pengguna,
          Id_Pengiriman, Tanggal_Pengiriman, Id_Kupon_Vendor, Waktu_Simpan_Data, Status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          masterId,
          '',           // Nomor_Order_Vendor
          '',           // Id_Vendor
          order.id_pengguna,
          0,            // Id_Pengiriman default
          null,         // Tanggal_Pengiriman
          null,         // Id_Kupon_Vendor
          now,
          'Draft'
        ]
      );
      const subId = (subResult as any).insertId;

      // 3️⃣ Insert DETAIL (items)
      const items = order.cart_data?.items || [];
      if (items.length) {
        const insertDetailPromises = items.map((item: any) => {
          return connection.query(
            `INSERT INTO tb_store_transaksi_detail
              (Id_Transaksi_Master, Id_Transaksi_Sub, Induk_Id_Transaksi_Detail,
              Id_Produk, Qty, Array_Object_Item_Atribut_Varian,
              Tipe_Produk, Nama_Produk, Deskripsi_Produk,
              Harga_Produk, Harga_Produk_Setelah_Diskon,
              Format_Garansi, Lama_Garansi, Poin_Yang_Didapatkan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              masterId,
              subId,
              null,                               // Induk_Id_Transaksi_Detail
              item.productId,
              item.quantity,
              JSON.stringify(item.specs || {}),
              item.tipeProduk || 'Barang',
              item.name,
              item.notes || '',
              item.price,
              item.total,
              null,                               // Format_Garansi
              null,                               // Lama_Garansi
              0                                   // Poin_Yang_Didapatkan default
            ]
          );
        });
        await Promise.all(insertDetailPromises);
      }

      // ✅ Commit transaksi
      await connection.commit();

      console.log('====================================');
      console.log('END OPERATIONS');
      console.log('====================================');

      return { data: { masterId, subId, items }, error: null };

    } catch (err) {
      await connection.rollback();
      console.error("❌ Database error createOrderAlvamitra:", err);
      return { data: null, error: err };
    } finally {
      connection.release();
    }
  }




  /**
   * Update quote
   */
  async updateQuote(quoteId: string, updates: Partial<Quote>): Promise<{ data: Quote | null; error: any }> {
    const updateFields: string[] = [];
    const queryParams: any[] = [quoteId, this.sessionId];
    let paramCount = 2;

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        paramCount++;
        if (key === 'cart_data' || key === 'customer_snapshot' || key === 'metadata') {
          updateFields.push(`${key} = $${paramCount}`);
          queryParams.push(JSON.stringify(value));
        } else {
          updateFields.push(`${key} = $${paramCount}`);
          queryParams.push(value);
        }
      }
    });

    // Always update updated_at
    paramCount++;
    updateFields.push(`updated_at = $${paramCount}`);
    queryParams.push(new Date().toISOString());

    const { data, error } = await this.executeWithSession<Quote>(
      `UPDATE quotes SET ${updateFields.join(', ')} 
       WHERE id = $1 AND session_id = $2
       RETURNING *`,
      queryParams,
      'update_quote'
    );

    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  /**
   * Get quote by ID
   */
  async getQuote(quoteId: string): Promise<{ data: Quote | null; error: any }> {
    const { data, error } = await this.executeWithSession<Quote>(
      'SELECT * FROM quotes WHERE id = $1 AND session_id = $2',
      [quoteId, this.sessionId],
      'get_quote'
    );

    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  /**
   * Get quotes for current session
   */
  async getSessionQuotes(limit = 20, offset = 0): Promise<{ data: Quote[] | null; error: any }> {
    const { data, error } = await this.executeWithSession<Quote>(
      `SELECT * FROM quotes 
       WHERE session_id = $1 
       ORDER BY updated_at DESC 
       LIMIT $2 OFFSET $3`,
      [this.sessionId, limit, offset],
      'get_session_quotes'
    );

    return { data: data || [], error };
  }

  /**
   * Generate unique quote number
   */
  async generateQuoteNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `QT${year}-`;

    // Get the last quote number for this year
    const { data } = await db.execute<{ quote_number: string }>(
      `SELECT quote_number FROM quotes 
       WHERE quote_number LIKE $1 
       ORDER BY quote_number DESC 
       LIMIT 1`,
      [`${prefix}%`],
      'generate_quote_number'
    );

    let nextNumber = 1;
    if (data && data.length > 0 && data[0]) {
      const lastNumber = data[0].quote_number.replace(prefix, '');
      nextNumber = parseInt(lastNumber) + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
  }

  // ====================================
  // TEMPLATE OPERATIONS
  // ====================================

  /**
   * Create template
   */
  async createTemplate(template: Omit<Template, 'id'>): Promise<{ data: Template | null; error: any }> {
    const { data, error } = await this.executeWithSession<Template>(
      `INSERT INTO templates (
        session_id, name, description, category, template_data, tags, 
        is_public, usage_count, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $9)
      RETURNING *`,
      [
        this.sessionId,
        template.name,
        template.description,
        template.category,
        JSON.stringify(template.template_data),
        JSON.stringify(template.tags),
        template.is_public,
        template.created_by,
        new Date().toISOString()
      ],
      'create_template'
    );

    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  /**
   * Get public templates and session templates
   */
  async getTemplates(category?: string, limit = 50): Promise<{ data: Template[] | null; error: any }> {
    let queryText = `
      SELECT * FROM templates 
      WHERE (is_public = true OR session_id = $1)
    `;
    const queryParams: any[] = [this.sessionId];

    if (category) {
      queryText += ' AND category = $2';
      queryParams.push(category);
    }

    queryText += ' ORDER BY usage_count DESC, updated_at DESC LIMIT $' + (queryParams.length + 1);
    queryParams.push(limit);

    const { data, error } = await this.executeWithSession<Template>(
      queryText,
      queryParams,
      'get_templates'
    );

    return { data: data || [], error };
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<{ data: Template | null; error: any }> {
    const { data, error } = await this.executeWithSession<Template>(
      'SELECT * FROM templates WHERE id = $1 AND (is_public = true OR session_id = $2)',
      [templateId, this.sessionId],
      'get_template'
    );

    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  /**
   * Increment template usage
   */
  async incrementTemplateUsage(templateId: string): Promise<{ data: any; error: any }> {
    const { data, error } = await this.executeWithSession(
      `UPDATE templates 
       SET usage_count = usage_count + 1, last_used_at = $1 
       WHERE id = $2
       RETURNING usage_count`,
      [new Date().toISOString(), templateId],
      'increment_template_usage'
    );

    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  // ====================================
  // BOQ IMPORT OPERATIONS
  // ====================================

  /**
   * Create BOQ import record
   */
  async createBOQImport(boqImport: Omit<BOQImport, 'id'>): Promise<{ data: BOQImport | null; error: any }> {
    const { data, error } = await this.executeWithSession<BOQImport>(
      `INSERT INTO boq_imports (
        session_id, filename, original_filename, file_size, mime_type, 
        status, processing_progress, error_message, total_items, 
        matched_items, unmatched_items, import_data, uploaded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        boqImport.session_id,
        boqImport.filename,
        boqImport.original_filename,
        boqImport.file_size,
        boqImport.mime_type,
        boqImport.status,
        boqImport.processing_progress,
        boqImport.error_message,
        boqImport.total_items,
        boqImport.matched_items,
        boqImport.unmatched_items,
        JSON.stringify(boqImport.import_data),
        new Date().toISOString()
      ],
      'create_boq_import'
    );

    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  /**
   * Update BOQ import status
   */
  async updateBOQImport(importId: string, updates: Partial<BOQImport>): Promise<{ data: BOQImport | null; error: any }> {
    const updateFields: string[] = [];
    const queryParams: any[] = [importId, this.sessionId];
    let paramCount = 2;

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        paramCount++;
        if (key === 'import_data') {
          updateFields.push(`${key} = $${paramCount}`);
          queryParams.push(JSON.stringify(value));
        } else {
          updateFields.push(`${key} = $${paramCount}`);
          queryParams.push(value);
        }
      }
    });

    const { data, error } = await this.executeWithSession<BOQImport>(
      `UPDATE boq_imports SET ${updateFields.join(', ')} 
       WHERE id = $1 AND session_id = $2
       RETURNING *`,
      queryParams,
      'update_boq_import'
    );

    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  /**
   * Get BOQ imports for session
   */
  async getBOQImports(limit = 20): Promise<{ data: BOQImport[] | null; error: any }> {
    const { data, error } = await this.executeWithSession<BOQImport>(
      `SELECT * FROM boq_imports 
       WHERE session_id = $1 
       ORDER BY uploaded_at DESC 
       LIMIT $2`,
      [this.sessionId, limit],
      'get_boq_imports'
    );

    return { data: data || [], error };
  }

  // ====================================
  // SEARCH OPERATIONS
  // ====================================

  /**
   * Global search across all entities
   */
  async globalSearch(query: string, limit = 50): Promise<{ data: SearchResult[] | null; error: any }> {
    const { data, error } = await this.executeWithSession<SearchResult>(
      `SELECT * FROM (
        SELECT 
          'product' as entity_type,
          id as entity_id,
          name as title,
          COALESCE(description, '') as description,
          category,
          1.0 as search_rank,
          jsonb_build_object('price', price, 'brand', brand) as metadata
        FROM products 
        WHERE is_active = true AND (name ILIKE $1 OR description ILIKE $1 OR brand ILIKE $1)
        
        UNION ALL
        
        SELECT 
          'customer' as entity_type,
          id as entity_id,
          name as title,
          COALESCE(email, '') as description,
          'customer' as category,
          0.9 as search_rank,
          jsonb_build_object('company', company, 'phone', phone) as metadata
        FROM customers 
        WHERE session_id = $2 AND (name ILIKE $1 OR email ILIKE $1 OR company ILIKE $1)
        
        UNION ALL
        
        SELECT 
          'quote' as entity_type,
          id as entity_id,
          quote_number as title,
          COALESCE(notes, '') as description,
          status as category,
          0.8 as search_rank,
          jsonb_build_object('total', (cart_data->>'finalTotal')::numeric) as metadata
        FROM quotes 
        WHERE session_id = $2 AND quote_number ILIKE $1
        
        UNION ALL
        
        SELECT 
          'template' as entity_type,
          id as entity_id,
          name as title,
          COALESCE(description, '') as description,
          category,
          0.7 as search_rank,
          jsonb_build_object('usage_count', usage_count, 'tags', tags) as metadata
        FROM templates 
        WHERE (is_public = true OR session_id = $2) AND name ILIKE $1
      ) combined_results 
      ORDER BY search_rank DESC, title 
      LIMIT $3`,
      [`%${query}%`, this.sessionId, limit],
      'global_search'
    );

    return { data: data || [], error };
  }

  /**
   * Get search suggestions
   */
  async getSearchSuggestions(partialQuery: string, type = 'all'): Promise<{ data: any[] | null; error: any }> {
    let queryText = '';
    let queryParams: any[] = [`%${partialQuery}%`];

    if (type === 'products' || type === 'all') {
      queryText = `
        SELECT DISTINCT name as suggestion, 'product' as type 
        FROM products 
        WHERE is_active = true AND name ILIKE $1
        LIMIT 10
      `;
    } else if (type === 'customers') {
      queryText = `
        SELECT DISTINCT name as suggestion, 'customer' as type 
        FROM customers 
        WHERE session_id = $2 AND name ILIKE $1
        LIMIT 10
      `;
      queryParams.push(this.sessionId);
    }

    const { data, error } = await this.executeWithSession(
      queryText,
      queryParams,
      'search_suggestions'
    );

    return { data: data || [], error };
  }

  /**
   * Log search query for analytics
   */
  async logSearchQuery(
    query: string,
    type: string,
    resultsCount: number,
    responseTime?: number
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await this.executeWithSession(
      `INSERT INTO search_analytics (
        session_id, search_query, search_type, results_count, 
        response_time_ms, searched_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        this.sessionId,
        query,
        type,
        resultsCount,
        responseTime,
        new Date().toISOString()
      ],
      'log_search_query'
    );

    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  // ====================================
  // ANALYTICS & MAINTENANCE
  // ====================================

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{ data: DatabaseStats | null; error: any }> {
    try {
      // Get table counts
      const tableCountQueries = [
        { text: 'SELECT COUNT(*) as count FROM customers', name: 'customers' },
        { text: 'SELECT COUNT(*) as count FROM products', name: 'products' },
        { text: 'SELECT COUNT(*) as count FROM quotes', name: 'quotes' },
        { text: 'SELECT COUNT(*) as count FROM templates', name: 'templates' },
        { text: 'SELECT COUNT(*) as count FROM boq_imports', name: 'boq_imports' },
      ];

      const tableCounts: any = {};
      for (const query of tableCountQueries) {
        const { data } = await db.execute<{ count: number }>(query.text, [], `stats_${query.name}`);
        tableCounts[query.name] = data && data.length > 0 ? parseInt(data[0].count.toString()) : 0;
      }

      const stats: DatabaseStats = {
        tables: tableCounts,
        session_stats: {
          active_sessions: 0, // TODO: Implement session tracking
          quotes_today: 0, // TODO: Calculate quotes created today
          templates_used_today: 0, // TODO: Calculate templates used today
        },
        performance: {
          avg_query_time: 0, // TODO: Implement query performance tracking
          cache_hit_rate: 0, // TODO: Implement caching metrics
          index_usage: 0, // TODO: Calculate index usage statistics
        },
      };

      return { data: stats, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Failed to get database stats',
          code: 'STATS_ERROR'
        }
      };
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(retentionDays = 7): Promise<{ data: any; error: any }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const { data, error } = await db.execute(
      `DELETE FROM quotes 
       WHERE created_at < $1 
       RETURNING id`,
      [cutoffDate.toISOString()],
      'cleanup_expired_sessions'
    );

    return { data: data || [], error };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      // Test basic connectivity
      const basicConnectivity = await db.test();
      
      if (!basicConnectivity) {
        return { 
          healthy: false, 
          details: { 
            error: 'Basic database connectivity test failed',
            timestamp: new Date().toISOString(),
            suggestion: 'Check PostgreSQL connection settings'
          } 
        };
      }

      // Test if core tables exist
      const coreTablesExist = await this.checkCoreTablesExist();
      
      return {
        healthy: basicConnectivity,
        details: {
          connection: 'ok',
          basicConnectivity: 'passed',
          coreTablesExist: coreTablesExist,
          schemaStatus: coreTablesExist ? 'initialized' : 'needs_setup',
          timestamp: new Date().toISOString(),
          ...(coreTablesExist ? {} : {
            suggestion: 'Database schema needs to be set up. Run migrations or create tables manually.'
          })
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          suggestion: 'Check PostgreSQL configuration and database permissions'
        },
      };
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();