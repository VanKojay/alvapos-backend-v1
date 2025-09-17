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
export declare class DatabaseService {
    private sessionId;
    constructor();
    setSession(sessionId: string): void;
    clearSession(): void;
    private executeWithSession;
    initializeDatabase(): Promise<{
        success: boolean;
        error?: string;
    }>;
    private checkCoreTablesExist;
    private runMigration;
    upsertCustomer(customer: Customer): Promise<{
        data: Customer | null;
        error: any;
    }>;
    getCustomer(customerId: string): Promise<{
        data: Customer | null;
        error: any;
    }>;
    searchCustomers(query: string, limit?: number): Promise<{
        data: Customer[];
        error: any;
    }>;
    getCategories(parentId?: string): Promise<{
        data: {
            id: any;
            name: any;
            description: any;
            parent_id: any;
        }[];
        error?: undefined;
    } | {
        data: any;
        error: Error;
    }>;
    getProducts(category?: string, search?: string, inStockOnly?: boolean, limit?: number, offset?: number): Promise<{
        data: {
            id: any;
            sku: any;
            name: any;
            categories: string[];
            prices: {
                type: string;
                value: any;
            }[];
            in_stock: boolean;
            stock: any;
            stock_by_warehouse: {
                warehouse: any;
                quantity: any;
                status: string;
            }[];
            tax: number;
            description: any;
            specifications: any;
            brand: any;
            image_url: any;
            is_active: boolean;
            sort_order: number;
        }[];
        error?: undefined;
    } | {
        data: any;
        error: Error;
    }>;
    getProduct(productId: string): Promise<{
        data: {
            id: any;
            name: any;
            category: any;
            prices: {
                type: string;
                value: any;
            }[];
            in_stock: boolean;
            description: any;
            specifications: any;
            brand: any;
            image_url: any;
            is_active: boolean;
            sort_order: any;
        };
        error: any;
    } | {
        data: any;
        error: Error;
    }>;
    searchProducts(query: string, filters?: {
        category?: string;
        brand?: string;
        priceMin?: number;
        priceMax?: number;
        inStockOnly?: boolean;
    }, sortBy?: string, limit?: number, offset?: number): Promise<{
        data: any[] | null;
        error: any;
    }>;
    createQuoteAlvamitra(quote: {
        quote_number: string;
        id_pengguna: string;
        organisasi_kode: string;
        nomor_whatsapp?: string;
        cart_data: any;
        notes?: string;
        tax_rate?: number;
    }): Promise<{
        data: any | null;
        error: any;
    }>;
    createOrderAlvamitra(order: {
        quote_number: string;
        id_pengguna: string;
        organisasi_kode: string;
        nomor_whatsapp?: string;
        cart_data: any;
        notes?: string;
        tax_rate?: number;
    }): Promise<{
        data: any | null;
        error: any;
    }>;
    updateQuote(quoteId: string, updates: Partial<Quote>): Promise<{
        data: Quote | null;
        error: any;
    }>;
    getQuote(quoteId: string): Promise<{
        data: Quote | null;
        error: any;
    }>;
    getSessionQuotes(limit?: number, offset?: number): Promise<{
        data: Quote[] | null;
        error: any;
    }>;
    generateQuoteNumber(): Promise<string>;
    createTemplate(template: Omit<Template, 'id'>): Promise<{
        data: Template | null;
        error: any;
    }>;
    getTemplates(category?: string, limit?: number): Promise<{
        data: Template[] | null;
        error: any;
    }>;
    getTemplate(templateId: string): Promise<{
        data: Template | null;
        error: any;
    }>;
    incrementTemplateUsage(templateId: string): Promise<{
        data: any;
        error: any;
    }>;
    createBOQImport(boqImport: Omit<BOQImport, 'id'>): Promise<{
        data: BOQImport | null;
        error: any;
    }>;
    updateBOQImport(importId: string, updates: Partial<BOQImport>): Promise<{
        data: BOQImport | null;
        error: any;
    }>;
    getBOQImports(limit?: number): Promise<{
        data: BOQImport[] | null;
        error: any;
    }>;
    globalSearch(query: string, limit?: number): Promise<{
        data: SearchResult[] | null;
        error: any;
    }>;
    getSearchSuggestions(partialQuery: string, type?: string): Promise<{
        data: any[] | null;
        error: any;
    }>;
    logSearchQuery(query: string, type: string, resultsCount: number, responseTime?: number): Promise<{
        data: any;
        error: any;
    }>;
    getDatabaseStats(): Promise<{
        data: DatabaseStats | null;
        error: any;
    }>;
    cleanupExpiredSessions(retentionDays?: number): Promise<{
        data: any;
        error: any;
    }>;
    healthCheck(): Promise<{
        healthy: boolean;
        details: any;
    }>;
}
export declare const databaseService: DatabaseService;
//# sourceMappingURL=DatabaseService.d.ts.map