import { Request, Response, NextFunction } from 'express';
import mysql, { Pool } from 'mysql2/promise';
import { Logger } from '@/utils/logger';

export interface DatabaseRequest extends Request {
  db?: {
    getProducts: (
      category?: string,
      search?: string,
      inStockOnly?: boolean,
      limit?: number,
      offset?: number
    ) => Promise<{ data: any[] | null; error?: Error }>;
    
    searchProducts: (
      query: string,
      filters: any,
      sortBy: string,
      limit: number,
      offset: number
    ) => Promise<{ data: any[] | null; error?: Error }>;
    
    getProduct: (
      id: string
    ) => Promise<{ data: any | null; error?: Error }>;

    logSearchQuery?: (
      query: string,
      type: string,
      count: number,
      responseTime: number
    ) => Promise<void>;
  };
}

export let poolAlvamitra: mysql.Pool;
export let poolSmartjmp: mysql.Pool;

export async function initMySQLPool() {
  // Pool untuk db_alvamitra
  poolAlvamitra = mysql.createPool({
    host: process.env.MYSQL_ALVAMITRA_HOST,
    port: parseInt(process.env.MYSQL_ALVAMITRA_PORT || '3306'),
    user: process.env.MYSQL_ALVAMITRA_USER,
    password: process.env.MYSQL_ALVAMITRA_PASSWORD,
    database: process.env.MYSQL_ALVAMITRA_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // Pool untuk db_smartjmp
  poolSmartjmp = mysql.createPool({
    host: process.env.MYSQL_SMARTJMP_HOST,
    port: parseInt(process.env.MYSQL_SMARTJMP_PORT || '3306'),
    user: process.env.MYSQL_SMARTJMP_USER,
    password: process.env.MYSQL_SMARTJMP_PASSWORD,
    database: process.env.MYSQL_SMARTJMP_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  try {
    const [rows1] = await poolAlvamitra.query('SELECT 1 AS connected');
    Logger.info(`✅ Connected to db_alvamitra: ${JSON.stringify(rows1)}`);

    const [rows2] = await poolSmartjmp.query('SELECT 1 AS connected');
    Logger.info(`✅ Connected to db_smartjmp: ${JSON.stringify(rows2)}`);
  } catch (error) {
    Logger.error('❌ MySQL connection failed:', error);
    process.exit(1);
  }
}


// Middleware untuk inject koneksi ke req.db
export function mysqlMiddleware() {
  
  // return async (req: DatabaseRequest, _res: Response, next: NextFunction) => {
  //   req.db = {
  //     // async getProducts(category, search, inStockOnly, limit, offset) {
  //     //   try {
  //     //     let sql = 'SELECT * FROM products WHERE 1=1';
  //     //     const params: any[] = [];

  //     //     if (category) {
  //     //       sql += ' AND category = ?';
  //     //       params.push(category);
  //     //     }
  //     //     if (search) {
  //     //       sql += ' AND name LIKE ?';
  //     //       params.push(`%${search}%`);
  //     //     }
  //     //     if (inStockOnly) {
  //     //       sql += ' AND stock > 0';
  //     //     }

  //     //     sql += ' LIMIT ? OFFSET ?';
  //     //     params.push(limit, offset);

  //     //     const [rows] = await pool.query(sql, params);
  //     //     return { data: rows as any[] };
  //     //   } catch (error) {
  //     //     Logger.error('Error fetching products from MySQL', error);
  //     //     return { data: null, error: error as Error };
  //     //   }
  //     // },

  //     // async searchProducts(query, filters, sortBy, limit, offset) {
  //     //   try {
  //     //     let sql = 'SELECT * FROM products WHERE name LIKE ?';
  //     //     const params: any[] = [`%${query}%`];

  //     //     // Bisa tambah filter lain di sini...
  //     //     if (filters.category) {
  //     //       sql += ' AND category = ?';
  //     //       params.push(filters.category);
  //     //     }

  //     //     sql += ` ORDER BY ${sortBy === 'price' ? 'price' : 'relevance'} LIMIT ? OFFSET ?`;
  //     //     params.push(limit, offset);

  //     //     const [rows] = await pool.query(sql, params);
  //     //     return { data: rows as any[] };
  //     //   } catch (error) {
  //     //     Logger.error('Error searching products in MySQL', error);
  //     //     return { data: null, error: error as Error };
  //     //   }
  //     // },

  //     // async getProduct(id) {
  //     //   try {
  //     //     const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  //     //     return { data: (rows as any[])[0] || null };
  //     //   } catch (error) {
  //     //     Logger.error('Error fetching product from MySQL', error);
  //     //     return { data: null, error: error as Error };
  //     //   }
  //     // },

  //     // async logSearchQuery(query, type, count, responseTime) {
  //     //   try {
  //     //     await pool.query(
  //     //       'INSERT INTO search_logs (query, type, results_count, response_time) VALUES (?, ?, ?, ?)',
  //     //       [query, type, count, responseTime]
  //     //     );
  //     //   } catch (error) {
  //     //     Logger.error('Error logging search query', error);
  //     //   }
  //     // }

  //   async getProducts(category, search, inStockOnly, limit, offset) {
  //     try {
  //       let sql = 'SELECT * FROM tb_store_produk WHERE 1=1';
  //       const params: any[] = [];

  //       if (category) {
  //         sql += ' AND Id_Kategori = ?';
  //         params.push(category);
  //       }
  //       if (search) {
  //         sql += ' AND Nama_Produk LIKE ?';
  //         params.push(`%${search}%`);
  //       }
  //       if (inStockOnly) {
  //         sql += ' AND Stok > 0';
  //       }

  //       sql += ' LIMIT ? OFFSET ?';
  //       params.push(limit, offset);

  //       // Debug log
  //       console.log('📜 SQL Query:', sql);
  //       console.log('📦 Params:', params);

  //       const [rows] = await pool.query(sql, params);

  //       console.log('✅ Rows fetched:', (rows as any[]).length);

  //       // return { data: rows as any[] };

  //       // ✅ Mapping MySQL → Interface Product
  //       const products = (rows as any[]).map(row => ({
  //         id: row.Id_Produk,
  //         name: row.Nama_Produk,
  //         category: row.Id_Kategori,
  //         price: row.Harga_Jual,
  //         in_stock: row.Stok > 0,
  //         description: row.Deskripsi,
  //         specifications: row.Spesifikasi ? row.Spesifikasi.split(',') : [],
  //         brand: row.Merk,
  //         image_url: row.Gambar,
  //         is_active: row.Aktif === 1,
  //         sort_order: row.Sort_Order || 0
  //       }));

  //       return { data: products };
  //     } catch (error) {
  //       Logger.error('Error fetching products from MySQL', error);
  //       console.error('❌ SQL Error:', error);
  //       return { data: null, error: error as Error };
  //     }
  //   },



  //   async searchProducts(query, filters, sortBy, limit, offset) {
  //     try {
  //       let sql = 'SELECT * FROM tb_store_produk WHERE Nama_Produk LIKE ?';
  //       const params: any[] = [`%${query}%`];

  //       if (filters.category) {
  //         sql += ' AND Id_Kategori = ?';
  //         params.push(filters.category);
  //       }

  //       sql += ` ORDER BY ${sortBy === 'price' ? 'Harga_Retail' : 'Id_Produk'} LIMIT ? OFFSET ?`;
  //       params.push(limit, offset);

  //       const [rows] = await pool.query(sql, params);
  //       return { data: rows as any[] };
  //     } catch (error) {
  //       Logger.error('Error searching products in MySQL', error);
  //       return { data: null, error: error as Error };
  //     }
  //   },

  //   async getProduct(id) {
  //     try {
  //       const [rows] = await pool.query('SELECT * FROM tb_store_produk WHERE Id_Produk = ?', [id]);
  //       return { data: (rows as any[])[0] || null };
  //     } catch (error) {
  //       Logger.error('Error fetching product from MySQL', error);
  //       return { data: null, error: error as Error };
  //     }
  //   },

  //   async logSearchQuery(query, type, count, responseTime) {
  //     try {
  //       await pool.query(
  //         'INSERT INTO search_logs (query, type, results_count, response_time) VALUES (?, ?, ?, ?)',
  //         [query, type, count, responseTime]
  //       );
  //     } catch (error) {
  //       Logger.error('Error logging search query', error);
  //     }
  //   }

  //   };

  //   next();
  // };
}
