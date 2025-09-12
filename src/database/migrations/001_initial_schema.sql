-- ALVA POS MVP - Initial Database Migration
-- Version: 1.0.0
-- Description: Create core database schema with session-based data isolation

-- ===========================================
-- EXTENSIONS (Safe to run multiple times)
-- ===========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===========================================
-- UTILITY FUNCTIONS
-- ===========================================

-- Search ranking function
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

-- Customers table
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  address jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  last_quote_date timestamptz,
  total_quotes integer DEFAULT 0,
  search_vector tsvector,
  
  CONSTRAINT customers_email_format CHECK (
    email IS NULL OR email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'
  ),
  CONSTRAINT customers_phone_format CHECK (
    phone IS NULL OR length(trim(phone)) >= 10
  ),
  CONSTRAINT customers_name_length CHECK (length(trim(name)) >= 2)
);

-- Products table
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku text UNIQUE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'cameras', 'recorders', 'storage', 'network', 'power', 'accessories'
  )),
  subcategory text,
  price decimal(10,2) NOT NULL CHECK (price >= 0),
  cost decimal(10,2) CHECK (cost IS NULL OR cost >= 0),
  in_stock boolean DEFAULT true,
  description text,
  specifications jsonb DEFAULT '[]'::jsonb,
  brand text,
  model text,
  image_url text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  search_vector tsvector,
  
  CONSTRAINT products_sku_format CHECK (
    sku IS NULL OR (length(trim(sku)) >= 3 AND sku ~ '^[A-Za-z0-9-_]+$')
  ),
  CONSTRAINT products_name_length CHECK (length(trim(name)) >= 2)
);

-- Quotes table
CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text,
  quote_number text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  cart_data jsonb NOT NULL DEFAULT '{
    "items": [],
    "laborItems": [],
    "subtotal": 0,
    "taxAmount": 0,
    "finalTotal": 0,
    "totalDiscount": null
  }'::jsonb,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  tax_rate decimal(5,4) DEFAULT 0.10,
  subtotal decimal(12,2) DEFAULT 0,
  tax_amount decimal(12,2) DEFAULT 0,
  final_total decimal(12,2) DEFAULT 0,
  source text DEFAULT 'fresh' CHECK (source IN ('fresh', 'boq', 'template')),
  template_id uuid,
  boq_import_id uuid,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  valid_until timestamptz,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  search_vector tsvector,
  
  CONSTRAINT quotes_totals_positive CHECK (
    subtotal >= 0 AND tax_amount >= 0 AND final_total >= 0
  ),
  CONSTRAINT quotes_valid_until_future CHECK (
    valid_until IS NULL OR valid_until > created_at
  ),
  CONSTRAINT quotes_tax_rate_valid CHECK (
    tax_rate >= 0 AND tax_rate <= 1
  )
);

-- Templates table
CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  template_data jsonb NOT NULL DEFAULT '{
    "items": [],
    "laborItems": [],
    "totalDiscount": null
  }'::jsonb,
  tags text[] DEFAULT '{}',
  is_public boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  last_used_at timestamptz,
  search_vector tsvector,
  
  CONSTRAINT templates_name_length CHECK (length(trim(name)) >= 2),
  CONSTRAINT templates_usage_count_positive CHECK (usage_count >= 0)
);

-- BOQ Imports table
CREATE TABLE boq_imports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text NOT NULL,
  filename text NOT NULL,
  original_filename text NOT NULL,
  file_size bigint,
  mime_type text,
  status text DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'completed', 'error')),
  processing_progress decimal(5,2) DEFAULT 0,
  error_message text,
  total_items integer DEFAULT 0,
  matched_items integer DEFAULT 0,
  unmatched_items integer DEFAULT 0,
  import_data jsonb DEFAULT '{}'::jsonb,
  uploaded_at timestamptz DEFAULT NOW(),
  processed_at timestamptz,
  
  CONSTRAINT boq_imports_progress_range CHECK (processing_progress >= 0 AND processing_progress <= 100),
  CONSTRAINT boq_imports_filename_length CHECK (length(trim(filename)) >= 1),
  CONSTRAINT boq_imports_file_size_positive CHECK (
    file_size IS NULL OR file_size > 0
  )
);

-- Session Analytics table
CREATE TABLE session_analytics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text NOT NULL,
  page_views integer DEFAULT 0,
  cart_additions integer DEFAULT 0,
  quotes_created integer DEFAULT 0,
  templates_used integer DEFAULT 0,
  avg_response_time decimal(8,2),
  search_queries integer DEFAULT 0,
  boq_imports integer DEFAULT 0,
  first_activity timestamptz DEFAULT NOW(),
  last_activity timestamptz DEFAULT NOW(),
  session_duration interval GENERATED ALWAYS AS (last_activity - first_activity) STORED,
  user_agent text,
  ip_address inet,
  referrer text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- ===========================================
-- INDEXES
-- ===========================================

-- Products indexes
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_name_trgm ON products USING GIN(lower(name) gin_trgm_ops);
CREATE INDEX idx_products_category ON products(category) WHERE is_active = true;
CREATE INDEX idx_products_price ON products(price) WHERE is_active = true;
CREATE INDEX idx_products_brand ON products(brand) WHERE is_active = true;

-- Customers indexes
CREATE INDEX idx_customers_search ON customers USING GIN(search_vector);
CREATE INDEX idx_customers_session ON customers(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;

-- Quotes indexes
CREATE INDEX idx_quotes_search ON quotes USING GIN(search_vector);
CREATE INDEX idx_quotes_session ON quotes(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_quotes_customer ON quotes(customer_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX idx_quotes_cart_data ON quotes USING GIN(cart_data);

-- Templates indexes
CREATE INDEX idx_templates_search ON templates USING GIN(search_vector);
CREATE INDEX idx_templates_public ON templates(is_public, category) WHERE is_public = true;
CREATE INDEX idx_templates_session ON templates(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_templates_tags ON templates USING GIN(tags);

-- BOQ imports indexes
CREATE INDEX idx_boq_imports_session ON boq_imports(session_id);
CREATE INDEX idx_boq_imports_status ON boq_imports(status, uploaded_at DESC);

-- Session analytics indexes
CREATE INDEX idx_session_analytics_session ON session_analytics(session_id);
CREATE INDEX idx_session_analytics_activity ON session_analytics(last_activity DESC);

-- ===========================================
-- SEARCH VECTOR TRIGGERS
-- ===========================================

-- Products search vector trigger
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

-- Customers search vector trigger
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

-- Quotes search vector trigger
CREATE OR REPLACE FUNCTION update_quotes_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.quote_number, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(NEW.notes, '')), 'B') ||
                      setweight(to_tsvector('english', coalesce((NEW.customer_snapshot->>'name'), '')), 'C');
  
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

-- Templates search vector trigger
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

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_analytics ENABLE ROW LEVEL SECURITY;

-- Products are global
ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY customers_session_policy ON customers
  FOR ALL
  USING (
    current_setting('role') = 'service_role' OR
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true)) OR
    session_id IS NULL
  );

CREATE POLICY quotes_session_policy ON quotes
  FOR ALL
  USING (
    current_setting('role') = 'service_role' OR
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true))
  );

CREATE POLICY templates_access_policy ON templates
  FOR SELECT
  USING (
    current_setting('role') = 'service_role' OR
    is_public = true OR
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true))
  );

CREATE POLICY templates_insert_policy ON templates
  FOR INSERT
  WITH CHECK (
    current_setting('role') = 'service_role' OR
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true))
  );

CREATE POLICY templates_update_policy ON templates
  FOR UPDATE
  USING (
    current_setting('role') = 'service_role' OR
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true))
  );

CREATE POLICY templates_delete_policy ON templates
  FOR DELETE
  USING (
    current_setting('role') = 'service_role' OR
    (session_id IS NOT NULL AND session_id = current_setting('app.current_session_id', true))
  );

CREATE POLICY boq_imports_session_policy ON boq_imports
  FOR ALL
  USING (
    current_setting('role') = 'service_role' OR
    session_id = current_setting('app.current_session_id', true)
  );

CREATE POLICY session_analytics_session_policy ON session_analytics
  FOR ALL
  USING (
    current_setting('role') = 'service_role' OR
    session_id = current_setting('app.current_session_id', true)
  );

-- ===========================================
-- PERFORMANCE VIEWS
-- ===========================================

-- Active quotes view
CREATE VIEW active_quotes AS
SELECT 
  q.*,
  c.name as customer_name,
  c.email as customer_email,
  c.company as customer_company,
  (q.cart_data->>'items')::jsonb as items_data,
  (q.cart_data->>'laborItems')::jsonb as labor_data
FROM quotes q
LEFT JOIN customers c ON q.customer_id = c.id
WHERE q.status IN ('draft', 'sent')
ORDER BY q.updated_at DESC;

-- Product catalog view
CREATE VIEW product_catalog AS
SELECT 
  p.*,
  0.0 as search_rank
FROM products p
WHERE p.is_active = true
ORDER BY p.category, p.sort_order, p.name;

-- ===========================================
-- SAMPLE DATA
-- ===========================================

-- Insert sample product categories
INSERT INTO products (name, category, price, description, brand, in_stock) VALUES
-- Cameras
('4MP IP Bullet Camera', 'cameras', 299.99, '4 Megapixel IP bullet camera with night vision', 'Hikvision', true),
('2MP PTZ Camera', 'cameras', 899.99, '2 Megapixel PTZ camera with 20x zoom', 'Dahua', true),
('8MP Dome Camera', 'cameras', 459.99, '8 Megapixel dome camera with vandal resistant housing', 'Axis', true),

-- Recorders
('8 Channel NVR', 'recorders', 599.99, '8 channel network video recorder with 2TB HDD', 'Hikvision', true),
('16 Channel NVR', 'recorders', 1299.99, '16 channel network video recorder with 4TB HDD', 'Dahua', true),

-- Storage
('2TB Surveillance HDD', 'storage', 189.99, '2TB hard drive optimized for surveillance systems', 'Western Digital', true),
('4TB Surveillance HDD', 'storage', 299.99, '4TB hard drive optimized for surveillance systems', 'Seagate', true),

-- Network
('8 Port PoE Switch', 'network', 159.99, '8 port PoE switch with 120W power budget', 'TP-Link', true),
('16 Port PoE Switch', 'network', 299.99, '16 port PoE switch with 250W power budget', 'Ubiquiti', true),

-- Power
('12V 5A Power Supply', 'power', 29.99, '12V 5A regulated power supply for cameras', 'Generic', true),
('24V 10A Power Supply', 'power', 79.99, '24V 10A regulated power supply for multiple cameras', 'Mean Well', true),

-- Accessories
('RJ45 Connector Pack', 'accessories', 19.99, 'Pack of 50 RJ45 connectors for network cables', 'Generic', true),
('Cat6 Cable 305m', 'accessories', 149.99, '305 meter roll of Cat6 network cable', 'Belden', true);

-- Insert sample templates
INSERT INTO templates (name, description, category, is_public, template_data, tags) VALUES
('Basic 4 Camera System', 'Standard 4 camera installation package', 'security_packages', true, '{
  "items": [
    {"productId": "sample-camera-1", "quantity": 4, "unitPrice": 299.99},
    {"productId": "sample-nvr-8ch", "quantity": 1, "unitPrice": 599.99},
    {"productId": "sample-hdd-2tb", "quantity": 1, "unitPrice": 189.99}
  ],
  "laborItems": [
    {"type": "installation", "name": "Camera Installation", "quantity": 8, "rate": 75.00, "unit": "hours"}
  ],
  "totalDiscount": null
}', ARRAY['basic', 'cameras', 'popular']),

('Enterprise 16 Camera System', 'Large scale 16 camera installation', 'enterprise_packages', true, '{
  "items": [
    {"productId": "sample-camera-1", "quantity": 16, "unitPrice": 299.99},
    {"productId": "sample-nvr-16ch", "quantity": 1, "unitPrice": 1299.99},
    {"productId": "sample-hdd-4tb", "quantity": 2, "unitPrice": 299.99}
  ],
  "laborItems": [
    {"type": "installation", "name": "Camera Installation", "quantity": 24, "rate": 75.00, "unit": "hours"},
    {"type": "commissioning", "name": "System Commissioning", "quantity": 1, "rate": 500.00, "unit": "job"}
  ],
  "totalDiscount": null
}', ARRAY['enterprise', 'large', 'cameras']);

-- Migration completed successfully