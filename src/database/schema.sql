-- ALVA POS MVP - Core Database Schema
-- Session-based data organization with full-text search and security policies
-- PostgreSQL with Supabase optimizations

-- ===========================================
-- EXTENSIONS & FUNCTIONS
-- ===========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom functions for full-text search ranking
CREATE OR REPLACE FUNCTION calculate_search_rank(
  doc tsvector,
  query tsquery,
  base_rank real DEFAULT 1.0
) RETURNS real AS $$
BEGIN
  RETURN ts_rank(doc, query) * base_rank;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Session cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_sessions(
  retention_days integer DEFAULT 7
) RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Cleanup quotes and related data
  DELETE FROM quotes 
  WHERE session_id IS NOT NULL 
  AND updated_at < NOW() - INTERVAL '1 day' * retention_days;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- CORE TABLES
-- ===========================================

-- Customers table - session-based organization
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text, -- Nullable for non-session customers
  name text NOT NULL,
  email text,
  phone text,
  company text,
  
  -- Address information (JSONB for flexibility)
  address jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  last_quote_date timestamptz,
  total_quotes integer DEFAULT 0,
  
  -- Full-text search
  search_vector tsvector,
  
  -- Constraints
  CONSTRAINT customers_email_format CHECK (
    email IS NULL OR email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'
  ),
  CONSTRAINT customers_phone_format CHECK (
    phone IS NULL OR length(trim(phone)) >= 10
  )
);

-- Quotes table - core cart and quote data
CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text, -- Session-based organization
  quote_number text UNIQUE NOT NULL,
  
  -- Customer reference
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Quote data stored as JSONB for flexibility
  cart_data jsonb NOT NULL DEFAULT '{
    "items": [],
    "laborItems": [],
    "subtotal": 0,
    "taxAmount": 0,
    "finalTotal": 0,
    "totalDiscount": null
  }'::jsonb,
  
  -- Customer snapshot (for historical accuracy)
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Quote metadata
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  tax_rate decimal(5,4) DEFAULT 0.10,
  subtotal decimal(12,2) DEFAULT 0,
  tax_amount decimal(12,2) DEFAULT 0,
  final_total decimal(12,2) DEFAULT 0,
  
  -- Source tracking
  source text DEFAULT 'fresh' CHECK (source IN ('fresh', 'boq', 'template')),
  template_id uuid,
  boq_import_id uuid,
  
  -- Timestamps
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  valid_until timestamptz,
  
  -- Notes and additional data
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Full-text search
  search_vector tsvector
);

-- Products table - global catalog (no session restriction)
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku text UNIQUE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'cameras', 'recorders', 'storage', 'network', 'power', 'accessories'
  )),
  subcategory text,
  
  -- Pricing and inventory
  price decimal(10,2) NOT NULL CHECK (price >= 0),
  cost decimal(10,2) CHECK (cost IS NULL OR cost >= 0),
  in_stock boolean DEFAULT true,
  
  -- Product details
  description text,
  specifications jsonb DEFAULT '[]'::jsonb,
  brand text,
  model text,
  image_url text,
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  
  -- Full-text search optimized
  search_vector tsvector,
  name_simple text GENERATED ALWAYS AS (lower(unaccent(name))) STORED,
  description_simple text GENERATED ALWAYS AS (lower(unaccent(coalesce(description, '')))) STORED,
  
  -- Constraints
  CONSTRAINT products_sku_format CHECK (
    sku IS NULL OR (length(trim(sku)) >= 3 AND sku ~ '^[A-Za-z0-9-_]+$')
  )
);

-- Templates table - reusable quote configurations
CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text, -- Optional session tracking
  name text NOT NULL,
  description text,
  category text NOT NULL,
  
  -- Template data structure (matches quote cart_data)
  template_data jsonb NOT NULL DEFAULT '{
    "items": [],
    "laborItems": [],
    "totalDiscount": null
  }'::jsonb,
  
  -- Template metadata
  tags text[] DEFAULT '{}',
  is_public boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_by text, -- Session or user identifier
  
  -- Timestamps
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  last_used_at timestamptz,
  
  -- Full-text search
  search_vector tsvector
);

-- BOQ Imports table - ALVA Survey integration tracking
CREATE TABLE boq_imports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text NOT NULL,
  filename text NOT NULL,
  original_filename text NOT NULL,
  file_size bigint,
  mime_type text,
  
  -- Import processing
  status text DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'completed', 'error')),
  processing_progress decimal(5,2) DEFAULT 0,
  error_message text,
  
  -- Import results
  total_items integer DEFAULT 0,
  matched_items integer DEFAULT 0,
  unmatched_items integer DEFAULT 0,
  import_data jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  uploaded_at timestamptz DEFAULT NOW(),
  processed_at timestamptz,
  
  -- Constraints
  CONSTRAINT boq_imports_progress_range CHECK (processing_progress >= 0 AND processing_progress <= 100)
);

-- Session Analytics - performance and usage tracking
CREATE TABLE session_analytics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text NOT NULL,
  
  -- Session metrics
  page_views integer DEFAULT 0,
  cart_additions integer DEFAULT 0,
  quotes_created integer DEFAULT 0,
  templates_used integer DEFAULT 0,
  
  -- Performance metrics
  avg_response_time decimal(8,2),
  search_queries integer DEFAULT 0,
  boq_imports integer DEFAULT 0,
  
  -- Session duration
  first_activity timestamptz DEFAULT NOW(),
  last_activity timestamptz DEFAULT NOW(),
  session_duration interval GENERATED ALWAYS AS (last_activity - first_activity) STORED,
  
  -- User agent and environment
  user_agent text,
  ip_address inet,
  referrer text,
  
  -- Additional metadata
  metadata jsonb DEFAULT '{}'::jsonb
);

-- ===========================================
-- FULL-TEXT SEARCH INDEXES
-- ===========================================

-- Products full-text search configuration
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_name_trgm ON products USING GIN(name_simple gin_trgm_ops);
CREATE INDEX idx_products_category ON products(category) WHERE is_active = true;
CREATE INDEX idx_products_price ON products(price) WHERE is_active = true;
CREATE INDEX idx_products_brand ON products(brand) WHERE is_active = true;

-- Customers search
CREATE INDEX idx_customers_search ON customers USING GIN(search_vector);
CREATE INDEX idx_customers_session ON customers(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;

-- Quotes search and session-based queries
CREATE INDEX idx_quotes_search ON quotes USING GIN(search_vector);
CREATE INDEX idx_quotes_session ON quotes(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_quotes_customer ON quotes(customer_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX idx_quotes_cart_data ON quotes USING GIN(cart_data);

-- Templates search
CREATE INDEX idx_templates_search ON templates USING GIN(search_vector);
CREATE INDEX idx_templates_public ON templates(is_public, category) WHERE is_public = true;
CREATE INDEX idx_templates_session ON templates(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_templates_tags ON templates USING GIN(tags);

-- BOQ imports session tracking
CREATE INDEX idx_boq_imports_session ON boq_imports(session_id);
CREATE INDEX idx_boq_imports_status ON boq_imports(status, uploaded_at DESC);

-- Session analytics
CREATE INDEX idx_session_analytics_session ON session_analytics(session_id);
CREATE INDEX idx_session_analytics_activity ON session_analytics(last_activity DESC);

-- ===========================================
-- TRIGGERS FOR SEARCH VECTORS & UPDATES
-- ===========================================

-- Products search vector update trigger
CREATE OR REPLACE FUNCTION update_products_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(NEW.brand, '')), 'B') ||
                      setweight(to_tsvector('english', coalesce(NEW.category, '')), 'C') ||
                      setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_products_search_vector 
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_products_search_vector();

-- Customers search vector update trigger
CREATE OR REPLACE FUNCTION update_customers_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(NEW.company, '')), 'B') ||
                      setweight(to_tsvector('english', coalesce(NEW.email, '')), 'C') ||
                      setweight(to_tsvector('english', coalesce(NEW.phone, '')), 'D');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_customers_search_vector 
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_customers_search_vector();

-- Quotes search vector and metadata update trigger
CREATE OR REPLACE FUNCTION update_quotes_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.quote_number, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(NEW.notes, '')), 'B') ||
                      setweight(to_tsvector('english', coalesce((NEW.customer_snapshot->>'name'), '')), 'C');
  
  -- Update calculated fields from cart_data
  NEW.subtotal := COALESCE((NEW.cart_data->>'subtotal')::decimal, 0);
  NEW.tax_amount := COALESCE((NEW.cart_data->>'taxAmount')::decimal, 0);
  NEW.final_total := COALESCE((NEW.cart_data->>'finalTotal')::decimal, 0);
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_quotes_search_vector 
  BEFORE INSERT OR UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_quotes_search_vector();

-- Templates search vector update trigger
CREATE OR REPLACE FUNCTION update_templates_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
                      setweight(to_tsvector('english', coalesce(NEW.category, '')), 'C') ||
                      setweight(to_tsvector('english', array_to_string(NEW.tags, ' ')), 'D');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_templates_search_vector 
  BEFORE INSERT OR UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_templates_search_vector();

-- Template usage tracking trigger
CREATE OR REPLACE FUNCTION update_template_usage() RETURNS trigger AS $$
BEGIN
  IF NEW.template_id IS NOT NULL AND NEW.template_id != OLD.template_id THEN
    UPDATE templates 
    SET usage_count = usage_count + 1, last_used_at = NOW() 
    WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_template_usage 
  AFTER UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_template_usage();

-- Customer quote count update trigger
CREATE OR REPLACE FUNCTION update_customer_quote_stats() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE customers 
    SET total_quotes = total_quotes + 1, last_quote_date = NOW()
    WHERE id = NEW.customer_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE customers 
    SET total_quotes = GREATEST(total_quotes - 1, 0)
    WHERE id = OLD.customer_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_customer_quote_stats 
  AFTER INSERT OR DELETE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_customer_quote_stats();

-- ===========================================
-- ROW LEVEL SECURITY POLICIES
-- ===========================================

-- Enable RLS on all session-based tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_analytics ENABLE ROW LEVEL SECURITY;

-- Products are global - no RLS needed
ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- Session-based access policies
-- These policies ensure data isolation while allowing service role access

-- Customers policy - session-based access
CREATE POLICY customers_session_policy ON customers
  FOR ALL
  USING (
    -- Allow service role full access
    current_setting('role') = 'service_role' OR
    -- Allow access to session-based records
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true)) OR
    -- Allow access to non-session records
    session_id IS NULL
  );

-- Quotes policy - session-based access  
CREATE POLICY quotes_session_policy ON quotes
  FOR ALL
  USING (
    current_setting('role') = 'service_role' OR
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true))
  );

-- Templates policy - public or session-based access
CREATE POLICY templates_access_policy ON templates
  FOR SELECT
  USING (
    current_setting('role') = 'service_role' OR
    is_public = true OR
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true))
  );

CREATE POLICY templates_modify_policy ON templates
  FOR INSERT, UPDATE, DELETE
  USING (
    current_setting('role') = 'service_role' OR
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true))
  );

-- BOQ imports policy - session-based access
CREATE POLICY boq_imports_session_policy ON boq_imports
  FOR ALL
  USING (
    current_setting('role') = 'service_role' OR
    session_id = current_setting('app.current_session_id', true)
  );

-- Session analytics policy - session-based access
CREATE POLICY session_analytics_session_policy ON session_analytics
  FOR ALL
  USING (
    current_setting('role') = 'service_role' OR
    session_id = current_setting('app.current_session_id', true)
  );

-- ===========================================
-- PERFORMANCE OPTIMIZATION VIEWS
-- ===========================================

-- Active quotes with customer information
CREATE VIEW active_quotes AS
SELECT 
  q.*,
  c.name as customer_name,
  c.email as customer_email,
  c.company as customer_company,
  (q.cart_data->>'items')::int as item_count,
  (q.cart_data->>'laborItems')::int as labor_count
FROM quotes q
LEFT JOIN customers c ON q.customer_id = c.id
WHERE q.status IN ('draft', 'sent')
ORDER BY q.updated_at DESC;

-- Product catalog with search optimization
CREATE VIEW product_catalog AS
SELECT 
  p.*,
  ts_rank(p.search_vector, plainto_tsquery('english', 'search_term')) as search_rank
FROM products p
WHERE p.is_active = true
ORDER BY p.category, p.sort_order, p.name;

-- Template gallery with usage stats
CREATE VIEW template_gallery AS
SELECT 
  t.*,
  CASE 
    WHEN t.usage_count > 10 THEN 'popular'
    WHEN t.usage_count > 5 THEN 'moderate' 
    ELSE 'new'
  END as popularity_level,
  (t.template_data->'items')::jsonb as preview_items
FROM templates t
WHERE t.is_public = true OR t.session_id = current_setting('app.current_session_id', true)
ORDER BY t.usage_count DESC, t.updated_at DESC;

-- Session performance metrics
CREATE VIEW session_performance AS
SELECT 
  session_id,
  COUNT(DISTINCT date_trunc('day', created_at)) as active_days,
  COUNT(*) as total_quotes,
  AVG(final_total) as avg_quote_value,
  SUM(final_total) as total_quote_value,
  MAX(created_at) as last_quote_date,
  COUNT(*) FILTER (WHERE status = 'accepted') as accepted_quotes,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'accepted')::decimal / 
    NULLIF(COUNT(*), 0) * 100, 2
  ) as conversion_rate
FROM quotes
WHERE session_id IS NOT NULL
GROUP BY session_id;