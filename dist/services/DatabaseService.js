"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseService = exports.DatabaseService = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const fs_1 = require("fs");
const path_1 = require("path");
const database_2 = require("../middleware/database");
class DatabaseService {
    constructor() {
        this.sessionId = null;
    }
    setSession(sessionId) {
        this.sessionId = sessionId;
        logger_1.Logger.debug('Database session set', { sessionId: sessionId.substring(0, 8) + '...' });
    }
    clearSession() {
        this.sessionId = null;
        logger_1.Logger.debug('Database session cleared');
    }
    async executeWithSession(queryText, values, context) {
        if (!this.sessionId) {
            logger_1.Logger.warn('Executing query without session context', { context });
            return database_1.db.execute(queryText, values, context);
        }
        return database_1.db.query(this.sessionId, queryText, values, context);
    }
    async initializeDatabase() {
        try {
            logger_1.Logger.info('Starting database initialization...');
            const connectionTest = await database_1.db.test();
            if (!connectionTest) {
                return {
                    success: false,
                    error: 'Database connection test failed'
                };
            }
            const coreTableExists = await this.checkCoreTablesExist();
            if (!coreTableExists) {
                logger_1.Logger.info('Core tables do not exist, attempting to create schema...');
                try {
                    await this.runMigration('001_initial_schema');
                    await this.runMigration('002_security_policies');
                    await this.runMigration('003_search_optimization');
                }
                catch (migrationError) {
                    logger_1.Logger.warn('Migration execution failed, database may need manual setup', {
                        error: migrationError instanceof Error ? migrationError.message : String(migrationError)
                    });
                    return {
                        success: false,
                        error: `Schema creation failed: ${migrationError instanceof Error ? migrationError.message : 'Unknown error'}`
                    };
                }
            }
            logger_1.Logger.info('Database initialization completed successfully');
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.Logger.error('Database initialization failed', { error: errorMessage });
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    async checkCoreTablesExist() {
        try {
            const { data, error } = await database_1.db.execute('SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) as exists', ['public', 'products'], 'check_core_tables');
            return !error && data && data.length > 0 && data[0].exists;
        }
        catch (error) {
            return false;
        }
    }
    async runMigration(migrationName) {
        try {
            const migrationPath = (0, path_1.join)(__dirname, '../database/migrations', `${migrationName}.sql`);
            try {
                const migrationSQL = (0, fs_1.readFileSync)(migrationPath, 'utf8');
                const { error } = await database_1.db.execute(migrationSQL, [], `migration_${migrationName}`);
                if (error) {
                    throw new Error(`Migration ${migrationName} failed: ${error.message}`);
                }
                logger_1.Logger.info(`Migration ${migrationName} executed successfully`);
            }
            catch (fileError) {
                if (fileError instanceof Error && fileError.message.includes('ENOENT')) {
                    logger_1.Logger.debug(`Migration file ${migrationName}.sql not found - skipping`);
                }
                else {
                    throw fileError;
                }
            }
        }
        catch (error) {
            logger_1.Logger.warn(`Migration ${migrationName} could not be executed`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    async upsertCustomer(customer) {
        const customerData = {
            ...customer,
            session_id: this.sessionId,
            updated_at: new Date().toISOString(),
        };
        if (customer.id) {
            const { data, error } = await this.executeWithSession(`UPDATE customers 
        SET name = $2, email = $3, phone = $4, company = $5, address = $6, updated_at = $7
        WHERE id = $1 AND session_id = $8
        RETURNING *`, [
                customer.id,
                customerData.name,
                customerData.email,
                customerData.phone || '',
                customerData.company || '',
                JSON.stringify(customerData.address),
                customerData.updated_at,
                this.sessionId
            ], 'upsert_customer_update');
            return { data: data && data.length > 0 ? data[0] : null, error };
        }
        else {
            const { data, error } = await this.executeWithSession(`INSERT INTO customers (
          session_id, name, email, phone, company, address, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`, [
                this.sessionId,
                customerData.name,
                customerData.email,
                customerData.phone || '',
                customerData.company || '',
                JSON.stringify(customerData.address),
                new Date().toISOString(),
                customerData.updated_at
            ], 'upsert_customer_create');
            return { data: data && data.length > 0 ? data[0] : null, error };
        }
    }
    async getCustomer(customerId) {
        const { data, error } = await this.executeWithSession('SELECT * FROM customers WHERE id = $1 AND session_id = $2', [customerId, this.sessionId], 'get_customer');
        return { data: data && data.length > 0 ? data[0] : null, error };
    }
    async searchCustomers(query, limit = 20) {
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
            const params = [];
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
            params.push(Number(limit));
            console.log('[searchCustomers] SQL:', sql);
            console.log('[searchCustomers] Params:', params);
            const [rows] = await database_2.poolAlvamitra.query(sql, params);
            console.log('[searchCustomers] Raw rows:', rows);
            const data = rows.map(r => ({
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
        }
        catch (error) {
            console.error('[searchCustomers] Error:', error);
            return { data: [], error };
        }
    }
    async getCategories(parentId) {
        try {
            let sql = `
        SELECT Id_Kategori, Kategori AS Nama_Kategori, Deskripsi_Kategori, Induk_Kategori
        FROM tb_store_produk_kategori
        WHERE 1=1
      `;
            const params = [];
            if (parentId) {
                sql += ' AND Induk_Kategori = ?';
                params.push(parentId);
            }
            sql += ' ORDER BY Kategori ASC';
            const [rows] = await database_2.poolAlvamitra.query(sql, params);
            const categories = rows.map(row => ({
                id: row.Id_Kategori,
                name: row.Nama_Kategori,
                description: row.Deskripsi_Kategori,
                parent_id: row.Induk_Kategori,
            }));
            console.log("=== FINAL CATEGORIES ===");
            return { data: categories };
        }
        catch (error) {
            logger_1.Logger.error('Error fetching categories from MySQL', error);
            console.error('🔥 MySQL Query Error:', error);
            return { data: null, error: error };
        }
    }
    async getProducts(category, search, inStockOnly, limit = 10, offset = 0) {
        try {
            console.log('==================1==================');
            let sql = `
        SELECT Id_Produk, Nama_Produk, SKU, Deskripsi_Produk, Foto, Foto_PNG,
              Id_Kategori, Id_Merek, Status, Harga_Anggota_Spesial, Harga_Anggota,
              Harga_Retail, Stok, Atribut_Produk
        FROM tb_store_produk
        WHERE 1=1 AND Status = 'Aktif'
      `;
            const params = [];
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
            const [rowsAlva] = await database_2.poolAlvamitra.query(sql, params);
            const skus = rowsAlva.map(row => row.SKU).filter(Boolean);
            let inventoryMap = {};
            let warehouseStockMap = {};
            if (skus.length > 0) {
                const [rowsItem] = await database_2.poolSmartjmp.query(`SELECT SKU, Id_Item, Nama_Item, Jumlah, Organisasi_Kode 
          FROM tb_v2_inventory_item 
          WHERE Status = 'Aktif' 
            AND Organisasi_Kode = '20190815113219K54579' 
            AND SKU IN (?)`, [skus]);
                inventoryMap = rowsItem.reduce((acc, row) => {
                    if (row.SKU) {
                        const key = row.SKU.trim().toUpperCase();
                        acc[key] = row;
                    }
                    return acc;
                }, {});
                const itemIds = rowsItem.map(r => r.Id_Item);
                if (itemIds.length > 0) {
                    const placeholders = itemIds.map(() => '?').join(',');
                    const [rowsGudang] = await database_2.poolSmartjmp.query(`SELECT 
                s.Id_Item,
                SUM(s.Jumlah) AS Jumlah,
                g.Nama_Gudang,
                i.Nama_Item
            FROM tb_v2_inventory_stok_gudang s
            JOIN tb_v2_inventory_gudang g ON s.Id_Gudang = g.Id_Gudang
            JOIN tb_v2_inventory_item i ON s.Id_Item = i.Id_Item
            WHERE s.Id_Item IN (${placeholders})
            GROUP BY s.Id_Item, g.Id_Gudang`, itemIds);
                    warehouseStockMap = rowsGudang.reduce((acc, row) => {
                        if (!acc[row.Id_Item])
                            acc[row.Id_Item] = [];
                        acc[row.Id_Item].push({
                            warehouse: row.Nama_Gudang,
                            quantity: Number(row.Jumlah) ?? 0,
                            status: (Number(row.Jumlah) ?? 0) > 0 ? 'Ready' : 'Out of Stock',
                        });
                        return acc;
                    }, {});
                }
            }
            let sqlTax = 'SELECT Angka_PPN FROM tb_data_ppn WHERE Status = "Aktif" LIMIT 1';
            const [taxRows] = await database_2.poolSmartjmp.query(sqlTax);
            let tax = 11;
            if (taxRows.length > 0) {
                tax = taxRows[0].PPN || 11;
            }
            const allCategoryIds = [
                ...new Set(rowsAlva.reduce((acc, row) => {
                    if (row.Id_Kategori) {
                        const ids = row.Id_Kategori.split(',').map((id) => id.trim());
                        acc.push(...ids);
                    }
                    return acc;
                }, []))
            ];
            const [catRows] = await database_2.poolAlvamitra.query(`SELECT Id_Kategori, Kategori AS Nama_Kategori, Deskripsi_Kategori, Induk_Kategori 
        FROM tb_store_produk_kategori 
        WHERE Id_Kategori IN (${allCategoryIds.join(',')})`);
            const categoryMap = {};
            catRows.forEach(cat => {
                categoryMap[String(cat.Id_Kategori).trim()] = cat.Nama_Kategori;
            });
            const products = await Promise.all(rowsAlva.map(async (row) => {
                const skuKey = row.SKU ? row.SKU.trim().toUpperCase() : null;
                const inv = skuKey ? inventoryMap[skuKey] : null;
                return {
                    id: row.Id_Produk,
                    sku: row.SKU,
                    name: row.Nama_Produk,
                    categories: row.Id_Kategori
                        ? String(row.Id_Kategori)
                            .split(',')
                            .map((id) => categoryMap[id.trim()])
                            .filter(Boolean)
                        : [],
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
            }));
            return { data: products };
        }
        catch (error) {
            logger_1.Logger.error('Error fetching products from MySQL', error);
            console.error('🔥 MySQL Query Error:', error);
            return { data: null, error: error };
        }
    }
    async getProduct(productId) {
        try {
            let sql = 'SELECT * FROM tb_store_produk WHERE Id_Produk = ? AND Status = "Aktif"';
            const params = [productId];
            console.log("📜 SQL Query:", sql);
            console.log("📦 Params:", params);
            const [rows] = await database_2.poolAlvamitra.query(sql, params);
            if (rows.length === 0) {
                console.log("⚠️ No product found for Id_Produk:", productId);
                return { data: null, error: null };
            }
            const row = rows[0];
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
        }
        catch (error) {
            logger_1.Logger.error("Error fetching product from MySQL", error);
            console.error("🔥 MySQL Query Error:", error);
            return { data: null, error: error };
        }
    }
    async searchProducts(query, filters = {}, sortBy = 'relevance', limit = 50, offset = 0) {
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
        const queryParams = [`%${query}%`];
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
        if (sortBy === 'relevance') {
            queryText += ` ORDER BY relevance_score DESC, name`;
        }
        else if (sortBy === 'price_asc') {
            queryText += ` ORDER BY price ASC`;
        }
        else if (sortBy === 'price_desc') {
            queryText += ` ORDER BY price DESC`;
        }
        else {
            queryText += ` ORDER BY name`;
        }
        queryText += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        queryParams.push(limit, offset);
        const { data, error } = await this.executeWithSession(queryText, queryParams, 'search_products_advanced');
        return { data: data || [], error };
    }
    async createQuoteAlvamitra(quote) {
        const connection = await database_2.poolAlvamitra.getConnection();
        try {
            console.log('====================================');
            console.log('QUOTE OPERATIONS');
            console.log('====================================');
            await connection.beginTransaction();
            const now = new Date();
            const [masterResult] = await connection.query(`INSERT INTO tb_store_estimasi_master
          (Nomor_Estimasi, Id_Pengguna, Organisasi_Kode, Note_Quotation, PPN, Waktu_Simpan_Data, Status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                quote.quote_number,
                quote.id_pengguna,
                quote.organisasi_kode,
                quote.notes || '',
                quote.tax_rate || 0,
                now,
                'Aktif'
            ]);
            const masterId = masterResult.insertId;
            const [subResult] = await connection.query(`INSERT INTO tb_store_estimasi_sub
          (Id_Estimasi_Master, Id_Pengguna, Waktu_Simpan_Data, Status)
        VALUES (?, ?, ?, ?)`, [masterId, quote.id_pengguna, now, 'Draft']);
            const subId = subResult.insertId;
            const items = quote.cart_data?.items || [];
            if (items.length) {
                const insertDetailPromises = items.map((item) => {
                    return connection.query(`INSERT INTO tb_store_estimasi_detail
              (Id_Estimasi_Master, Id_Estimasi_Sub, Id_Produk, Qty, Array_Object_Item_Atribut_Varian, Tipe_Produk, Nama_Produk, Deskripsi_Produk, Harga_Produk, Harga_Produk_Setelah_Diskon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
                    ]);
                });
                await Promise.all(insertDetailPromises);
            }
            await connection.commit();
            console.log('====================================');
            console.log('END OPERATIONS');
            console.log('====================================');
            return { data: { masterId, subId, items }, error: null };
        }
        catch (err) {
            await connection.rollback();
            console.error("Database error createQuoteAlvamitra:", err);
            return { data: null, error: err };
        }
        finally {
            connection.release();
        }
    }
    async createOrderAlvamitra(order) {
        const connection = await database_2.poolAlvamitra.getConnection();
        try {
            console.log('====================================');
            console.log('ORDER OPERATIONS');
            console.log('====================================');
            await connection.beginTransaction();
            const now = new Date();
            const [masterResult] = await connection.query(`INSERT INTO tb_store_transaksi_master
          (Nomor_Order, Id_Pengguna, Organisasi_Kode, Id_Pengguna_SMARTJMP, Organisasi_Kode_SMARTJMP,
          Id_Account, Id_Call, Id_Pembayaran, Id_Kupon, Status_Order, Sub_Status_Order,
          Tanggal_Order, PPN, Id_Kode_Promo, Redeem_Order, Sub_Total_Pembelian,
          PPN_Total_Pembelian, Promo_Total_Pembelian, Harga_Total_Pembelian,
          Waktu_Simpan_Data, Status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                order.quote_number,
                order.id_pengguna,
                order.organisasi_kode,
                0,
                '',
                null,
                null,
                0,
                null,
                'Draft',
                'Pending',
                now,
                String(order.tax_rate || 0),
                0,
                0,
                '0',
                '0',
                '0',
                '0',
                now,
                'Aktif'
            ]);
            const masterId = masterResult.insertId;
            const [subResult] = await connection.query(`INSERT INTO tb_store_transaksi_sub
          (Id_Transaksi_Master, Nomor_Order_Vendor, Id_Vendor, Id_Pengguna,
          Id_Pengiriman, Tanggal_Pengiriman, Id_Kupon_Vendor, Waktu_Simpan_Data, Status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                masterId,
                '',
                '',
                order.id_pengguna,
                0,
                null,
                null,
                now,
                'Draft'
            ]);
            const subId = subResult.insertId;
            const items = order.cart_data?.items || [];
            if (items.length) {
                const insertDetailPromises = items.map((item) => {
                    return connection.query(`INSERT INTO tb_store_transaksi_detail
              (Id_Transaksi_Master, Id_Transaksi_Sub, Induk_Id_Transaksi_Detail,
              Id_Produk, Qty, Array_Object_Item_Atribut_Varian,
              Tipe_Produk, Nama_Produk, Deskripsi_Produk,
              Harga_Produk, Harga_Produk_Setelah_Diskon,
              Format_Garansi, Lama_Garansi, Poin_Yang_Didapatkan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        masterId,
                        subId,
                        null,
                        item.productId,
                        item.quantity,
                        JSON.stringify(item.specs || {}),
                        item.tipeProduk || 'Barang',
                        item.name,
                        item.notes || '',
                        item.price,
                        item.total,
                        null,
                        null,
                        0
                    ]);
                });
                await Promise.all(insertDetailPromises);
            }
            await connection.commit();
            console.log('====================================');
            console.log('END OPERATIONS');
            console.log('====================================');
            return { data: { masterId, subId, items }, error: null };
        }
        catch (err) {
            await connection.rollback();
            console.error("❌ Database error createOrderAlvamitra:", err);
            return { data: null, error: err };
        }
        finally {
            connection.release();
        }
    }
    async updateQuote(quoteId, updates) {
        const updateFields = [];
        const queryParams = [quoteId, this.sessionId];
        let paramCount = 2;
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined && key !== 'id') {
                paramCount++;
                if (key === 'cart_data' || key === 'customer_snapshot' || key === 'metadata') {
                    updateFields.push(`${key} = $${paramCount}`);
                    queryParams.push(JSON.stringify(value));
                }
                else {
                    updateFields.push(`${key} = $${paramCount}`);
                    queryParams.push(value);
                }
            }
        });
        paramCount++;
        updateFields.push(`updated_at = $${paramCount}`);
        queryParams.push(new Date().toISOString());
        const { data, error } = await this.executeWithSession(`UPDATE quotes SET ${updateFields.join(', ')} 
       WHERE id = $1 AND session_id = $2
       RETURNING *`, queryParams, 'update_quote');
        return { data: data && data.length > 0 ? data[0] : null, error };
    }
    async getQuote(quoteId) {
        const { data, error } = await this.executeWithSession('SELECT * FROM quotes WHERE id = $1 AND session_id = $2', [quoteId, this.sessionId], 'get_quote');
        return { data: data && data.length > 0 ? data[0] : null, error };
    }
    async getSessionQuotes(limit = 20, offset = 0) {
        const { data, error } = await this.executeWithSession(`SELECT * FROM quotes 
       WHERE session_id = $1 
       ORDER BY updated_at DESC 
       LIMIT $2 OFFSET $3`, [this.sessionId, limit, offset], 'get_session_quotes');
        return { data: data || [], error };
    }
    async generateQuoteNumber() {
        const year = new Date().getFullYear();
        const prefix = `QT${year}-`;
        const { data } = await database_1.db.execute(`SELECT quote_number FROM quotes 
       WHERE quote_number LIKE $1 
       ORDER BY quote_number DESC 
       LIMIT 1`, [`${prefix}%`], 'generate_quote_number');
        let nextNumber = 1;
        if (data && data.length > 0 && data[0]) {
            const lastNumber = data[0].quote_number.replace(prefix, '');
            nextNumber = parseInt(lastNumber) + 1;
        }
        return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
    }
    async createTemplate(template) {
        const { data, error } = await this.executeWithSession(`INSERT INTO templates (
        session_id, name, description, category, template_data, tags, 
        is_public, usage_count, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $9)
      RETURNING *`, [
            this.sessionId,
            template.name,
            template.description,
            template.category,
            JSON.stringify(template.template_data),
            JSON.stringify(template.tags),
            template.is_public,
            template.created_by,
            new Date().toISOString()
        ], 'create_template');
        return { data: data && data.length > 0 ? data[0] : null, error };
    }
    async getTemplates(category, limit = 50) {
        let queryText = `
      SELECT * FROM templates 
      WHERE (is_public = true OR session_id = $1)
    `;
        const queryParams = [this.sessionId];
        if (category) {
            queryText += ' AND category = $2';
            queryParams.push(category);
        }
        queryText += ' ORDER BY usage_count DESC, updated_at DESC LIMIT $' + (queryParams.length + 1);
        queryParams.push(limit);
        const { data, error } = await this.executeWithSession(queryText, queryParams, 'get_templates');
        return { data: data || [], error };
    }
    async getTemplate(templateId) {
        const { data, error } = await this.executeWithSession('SELECT * FROM templates WHERE id = $1 AND (is_public = true OR session_id = $2)', [templateId, this.sessionId], 'get_template');
        return { data: data && data.length > 0 ? data[0] : null, error };
    }
    async incrementTemplateUsage(templateId) {
        const { data, error } = await this.executeWithSession(`UPDATE templates 
       SET usage_count = usage_count + 1, last_used_at = $1 
       WHERE id = $2
       RETURNING usage_count`, [new Date().toISOString(), templateId], 'increment_template_usage');
        return { data: data && data.length > 0 ? data[0] : null, error };
    }
    async createBOQImport(boqImport) {
        const { data, error } = await this.executeWithSession(`INSERT INTO boq_imports (
        session_id, filename, original_filename, file_size, mime_type, 
        status, processing_progress, error_message, total_items, 
        matched_items, unmatched_items, import_data, uploaded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`, [
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
        ], 'create_boq_import');
        return { data: data && data.length > 0 ? data[0] : null, error };
    }
    async updateBOQImport(importId, updates) {
        const updateFields = [];
        const queryParams = [importId, this.sessionId];
        let paramCount = 2;
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined && key !== 'id') {
                paramCount++;
                if (key === 'import_data') {
                    updateFields.push(`${key} = $${paramCount}`);
                    queryParams.push(JSON.stringify(value));
                }
                else {
                    updateFields.push(`${key} = $${paramCount}`);
                    queryParams.push(value);
                }
            }
        });
        const { data, error } = await this.executeWithSession(`UPDATE boq_imports SET ${updateFields.join(', ')} 
       WHERE id = $1 AND session_id = $2
       RETURNING *`, queryParams, 'update_boq_import');
        return { data: data && data.length > 0 ? data[0] : null, error };
    }
    async getBOQImports(limit = 20) {
        const { data, error } = await this.executeWithSession(`SELECT * FROM boq_imports 
       WHERE session_id = $1 
       ORDER BY uploaded_at DESC 
       LIMIT $2`, [this.sessionId, limit], 'get_boq_imports');
        return { data: data || [], error };
    }
    async globalSearch(query, limit = 50) {
        const { data, error } = await this.executeWithSession(`SELECT * FROM (
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
      LIMIT $3`, [`%${query}%`, this.sessionId, limit], 'global_search');
        return { data: data || [], error };
    }
    async getSearchSuggestions(partialQuery, type = 'all') {
        let queryText = '';
        let queryParams = [`%${partialQuery}%`];
        if (type === 'products' || type === 'all') {
            queryText = `
        SELECT DISTINCT name as suggestion, 'product' as type 
        FROM products 
        WHERE is_active = true AND name ILIKE $1
        LIMIT 10
      `;
        }
        else if (type === 'customers') {
            queryText = `
        SELECT DISTINCT name as suggestion, 'customer' as type 
        FROM customers 
        WHERE session_id = $2 AND name ILIKE $1
        LIMIT 10
      `;
            queryParams.push(this.sessionId);
        }
        const { data, error } = await this.executeWithSession(queryText, queryParams, 'search_suggestions');
        return { data: data || [], error };
    }
    async logSearchQuery(query, type, resultsCount, responseTime) {
        const { data, error } = await this.executeWithSession(`INSERT INTO search_analytics (
        session_id, search_query, search_type, results_count, 
        response_time_ms, searched_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`, [
            this.sessionId,
            query,
            type,
            resultsCount,
            responseTime,
            new Date().toISOString()
        ], 'log_search_query');
        return { data: data && data.length > 0 ? data[0] : null, error };
    }
    async getDatabaseStats() {
        try {
            const tableCountQueries = [
                { text: 'SELECT COUNT(*) as count FROM customers', name: 'customers' },
                { text: 'SELECT COUNT(*) as count FROM products', name: 'products' },
                { text: 'SELECT COUNT(*) as count FROM quotes', name: 'quotes' },
                { text: 'SELECT COUNT(*) as count FROM templates', name: 'templates' },
                { text: 'SELECT COUNT(*) as count FROM boq_imports', name: 'boq_imports' },
            ];
            const tableCounts = {};
            for (const query of tableCountQueries) {
                const { data } = await database_1.db.execute(query.text, [], `stats_${query.name}`);
                tableCounts[query.name] = data && data.length > 0 ? parseInt(data[0].count.toString()) : 0;
            }
            const stats = {
                tables: tableCounts,
                session_stats: {
                    active_sessions: 0,
                    quotes_today: 0,
                    templates_used_today: 0,
                },
                performance: {
                    avg_query_time: 0,
                    cache_hit_rate: 0,
                    index_usage: 0,
                },
            };
            return { data: stats, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: {
                    message: error instanceof Error ? error.message : 'Failed to get database stats',
                    code: 'STATS_ERROR'
                }
            };
        }
    }
    async cleanupExpiredSessions(retentionDays = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const { data, error } = await database_1.db.execute(`DELETE FROM quotes 
       WHERE created_at < $1 
       RETURNING id`, [cutoffDate.toISOString()], 'cleanup_expired_sessions');
        return { data: data || [], error };
    }
    async healthCheck() {
        try {
            const basicConnectivity = await database_1.db.test();
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
        }
        catch (error) {
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
exports.DatabaseService = DatabaseService;
exports.databaseService = new DatabaseService();
//# sourceMappingURL=DatabaseService.js.map