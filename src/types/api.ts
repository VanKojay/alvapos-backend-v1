// ALVA POS MVP - API Type Definitions
// Comprehensive TypeScript types for all API models and responses

// ===========================================
// BASE TYPES
// ===========================================

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface SessionEntity extends BaseEntity {
  session_id?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface SearchQuery extends PaginationQuery {
  q?: string;
  filters?: Record<string, any>;
}

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  meta?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId?: string;
}

// ===========================================
// DISCOUNT TYPES
// ===========================================

export interface Discount {
  type: 'percentage' | 'nominal';
  value: number;
  appliedAmount: number;
  reason?: string;
}

// ===========================================
// CART ITEM TYPES
// ===========================================

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  specs?: Record<string, any>;
  discount?: Discount;
  notes?: string;
  boqSource?: string;
  subtotal: number;
  total: number;
}

export interface LaborItem {
  id: string;
  type: string;
  name: string;
  description?: string;
  rateType: 'hourly' | 'fixed' | 'per_unit';
  rate: number;
  quantity: number;
  unit: string;
  discount?: Discount;
  subtotal: number;
  total: number;
  editable: boolean;
  category: string;
}

export interface CartTotals {
  subtotal: number;
  itemsSubtotal: number;
  laborSubtotal: number;
  itemDiscounts: number;
  laborDiscounts: number;
  totalDiscount?: Discount | undefined;
  taxRate: number;
  taxAmount: number;
  finalTotal: number;
}

export interface CartData {
  items: CartItem[];
  laborItems: LaborItem[];
  totals: CartTotals;
  totalDiscount?: Discount | undefined;
  metadata?: Record<string, any> | undefined;
}

// ===========================================
// CUSTOMER TYPES
// ===========================================

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface Customer extends SessionEntity {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: CustomerAddress;
  last_quote_date?: string;
  total_quotes: number;
}

export interface CustomerCreateRequest {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: CustomerAddress;
}

export interface CustomerUpdateRequest extends Partial<CustomerCreateRequest> {
  // All fields optional for updates
}

export interface CustomerSearchQuery extends SearchQuery {
  name?: string;
  email?: string;
  company?: string;
}

// ===========================================
// PRODUCT TYPES
// ===========================================

export interface ProductSpecification {
  name: string;
  value: string;
  unit?: string;
}

export interface Product extends BaseEntity {
  sku?: string;
  name: string;
  category: 'cameras' | 'recorders' | 'storage' | 'network' | 'power' | 'accessories';
  subcategory?: string;
  price: number;
  cost?: number;
  in_stock: boolean;
  description?: string;
  specifications?: ProductSpecification[];
  brand?: string;
  model?: string;
  image_url?: string;
  is_active: boolean;
  sort_order: number;
  stock?: number;
  stock_by_warehouse?: Array<{
    warehouse: string;
    quantity: number;
    status: string;
  }>;
}

export interface ProductCreateRequest {
  sku?: string;
  name: string;
  category: Product['category'];
  subcategory?: string;
  price: number;
  cost?: number;
  description?: string;
  specifications?: ProductSpecification[];
  brand?: string;
  model?: string;
  image_url?: string;
}

export interface ProductUpdateRequest extends Partial<ProductCreateRequest> {
  in_stock?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface ProductSearchQuery extends SearchQuery {
  category?: string;
  brand?: string;
  price_min?: number;
  price_max?: number;
  in_stock?: boolean;
}

export interface ProductSearchResult extends Product {
  search_rank?: number;
  match_type?: 'exact' | 'fuzzy' | 'partial';
}

// ===========================================
// QUOTE TYPES
// ===========================================

export interface Quote extends SessionEntity {
  quote_number: string;
  customer_id?: string;
  customer_snapshot: Customer;
  cart_data: CartData;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  final_total: number;
  source: 'fresh' | 'boq' | 'template';
  template_id?: string;
  boq_import_id?: string;
  valid_until?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface QuoteCreateRequest {
  nomor_whatsapp: any;
  customer_id?: string;
  customer_data?: CustomerCreateRequest;
  cart_data: CartData;
  tax_rate?: number;
  source?: Quote['source'];
  template_id?: string;
  boq_import_id?: string;
  notes?: string;
  valid_days?: number;
  metadata?: Record<string, any>;
}

export interface QuoteUpdateRequest {
  customer_id?: string;
  customer_data?: CustomerUpdateRequest;
  cart_data?: CartData;
  status?: Quote['status'];
  tax_rate?: number;
  notes?: string;
  valid_until?: string;
  metadata?: Record<string, any>;
}

export interface QuoteSearchQuery extends SearchQuery {
  customer_id?: string;
  status?: Quote['status'] | Quote['status'][];
  source?: Quote['source'];
  date_from?: string;
  date_to?: string;
  min_total?: number;
  max_total?: number;
}

export interface QuoteSummary {
  id: string;
  quote_number: string;
  customer_name?: string;
  status: Quote['status'];
  final_total: number;
  created_at: string;
  updated_at: string;
  item_count: number;
  labor_count: number;
}

// ===========================================
// TEMPLATE TYPES
// ===========================================

export interface Template extends SessionEntity {
  name: string;
  description?: string;
  category: string;
  template_data: {
    items: Omit<CartItem, 'id'>[];
    laborItems: Omit<LaborItem, 'id'>[];
    totalDiscount?: Discount;
  };
  tags: string[];
  is_public: boolean;
  usage_count: number;
  created_by?: string;
  last_used_at?: string;
}

export interface TemplateCreateRequest {
  name: string;
  description?: string;
  category: string;
  template_data: Template['template_data'];
  tags?: string[];
  is_public?: boolean;
}

export interface TemplateUpdateRequest extends Partial<TemplateCreateRequest> {
  // All fields optional for updates
}

export interface TemplateSearchQuery extends SearchQuery {
  category?: string;
  tags?: string[];
  is_public?: boolean;
}

// ===========================================
// BOQ IMPORT TYPES
// ===========================================

export interface BOQImport extends BaseEntity {
  session_id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  processing_progress: number;
  error_message?: string;
  total_items: number;
  matched_items: number;
  unmatched_items: number;
  import_data: Record<string, any>;
  uploaded_at: string;
  processed_at?: string;
}

export interface BOQImportRequest {
  filename: string;
  file_size: number;
  mime_type: string;
}

// ===========================================
// SESSION & ANALYTICS TYPES
// ===========================================

export interface SessionAnalytics extends BaseEntity {
  session_id: string;
  page_views: number;
  cart_additions: number;
  quotes_created: number;
  templates_used: number;
  avg_response_time?: number;
  search_queries: number;
  boq_imports: number;
  first_activity: string;
  last_activity: string;
  session_duration: string;
  user_agent?: string;
  ip_address?: string;
  referrer?: string;
  metadata?: Record<string, any>;
}

// ===========================================
// ERROR TYPES
// ===========================================

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
  validation_errors?: ValidationError[];
  stack?: string;
}

// ===========================================
// REQUEST/RESPONSE HELPERS
// ===========================================

export interface BulkOperation<T> {
  items: T[];
  options?: {
    continue_on_error?: boolean;
    return_details?: boolean;
  };
}

export interface BulkOperationResult<T> {
  success_count: number;
  error_count: number;
  results: Array<{
    success: boolean;
    data?: T;
    error?: string;
    index: number;
  }>;
}

// Request context types
export interface RequestContext {
  sessionId?: string;
  requestId: string;
  userAgent?: string;
  ipAddress?: string;
  timestamp: string;
}

// Export utility type helpers
export type CreateRequest<T> = Omit<T, keyof BaseEntity>;
export type UpdateRequest<T> = Partial<Omit<T, keyof BaseEntity | 'id'>>;
export type EntityWithoutTimestamps<T> = Omit<T, 'created_at' | 'updated_at'>;