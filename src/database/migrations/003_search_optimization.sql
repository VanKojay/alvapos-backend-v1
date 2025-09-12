-- ALVA POS MVP - Search Optimization Migration
-- Version: 1.0.2
-- Description: Full-text search system with performance optimization and analytics

-- ===========================================
-- MIGRATION METADATA
-- ===========================================

-- Search optimization migration starting

-- ===========================================
-- SEARCH CONFIGURATION
-- ===========================================

-- Create custom search configuration
DROP TEXT SEARCH CONFIGURATION IF EXISTS alva_search CASCADE;
CREATE TEXT SEARCH CONFIGURATION alva_search (COPY = pg_catalog.english);

-- Custom stopwords for POS domain
CREATE TABLE IF NOT EXISTS custom_stopwords (
  word text PRIMARY KEY,
  category text
);

-- Insert custom stopwords if they don't exist
INSERT INTO custom_stopwords (word, category) VALUES
('pcs', 'quantity'),
('qty', 'quantity'), 
('each', 'quantity'),
('set', 'quantity'),
('system', 'generic'),
('device', 'generic'),
('equipment', 'generic'),
('unit', 'generic')
ON CONFLICT (word) DO NOTHING;

-- ===========================================
-- ADVANCED SEARCH FUNCTIONS
-- ===========================================

-- Multi-table search with ranking
CREATE OR REPLACE FUNCTION search_all(
  search_query text,
  session_id text DEFAULT NULL,
  limit_results integer DEFAULT 50,
  offset_results integer DEFAULT 0
) RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  title text,
  description text,
  category text,
  search_rank real,
  metadata jsonb
) AS $$
DECLARE
  ts_query tsquery;
BEGIN
  -- Parse and prepare search query
  ts_query := websearch_to_tsquery('alva_search', search_query);
  
  RETURN QUERY
  -- Search products
  SELECT 
    'product'::text as entity_type,
    p.id as entity_id,
    p.name as title,
    COALESCE(p.description, '') as description,
    p.category as category,
    calculate_search_rank(p.search_vector, ts_query, 1.0) as search_rank,
    jsonb_build_object(
      'price', p.price,
      'brand', p.brand,
      'sku', p.sku,
      'in_stock', p.in_stock
    ) as metadata
  FROM products p
  WHERE p.is_active = true 
    AND (p.search_vector @@ ts_query OR similarity(lower(p.name), lower(search_query)) > 0.3)
  
  UNION ALL
  
  -- Search customers (session-based)
  SELECT 
    'customer'::text as entity_type,
    c.id as entity_id,
    c.name as title,
    COALESCE(c.company, '') as description,
    'customer'::text as category,
    calculate_search_rank(c.search_vector, ts_query, 0.8) as search_rank,
    jsonb_build_object(
      'email', c.email,
      'phone', c.phone,
      'total_quotes', c.total_quotes
    ) as metadata
  FROM customers c
  WHERE c.search_vector @@ ts_query
    AND (session_id IS NULL OR c.session_id = search_all.session_id OR c.session_id IS NULL)
  
  UNION ALL
  
  -- Search quotes (session-based)
  SELECT 
    'quote'::text as entity_type,
    q.id as entity_id,
    q.quote_number as title,
    COALESCE(q.notes, '') as description,
    q.status as category,
    calculate_search_rank(q.search_vector, ts_query, 0.9) as search_rank,
    jsonb_build_object(
      'final_total', q.final_total,
      'status', q.status,
      'created_at', q.created_at
    ) as metadata
  FROM quotes q
  WHERE q.search_vector @@ ts_query
    AND (session_id IS NULL OR q.session_id = search_all.session_id)
  
  UNION ALL
  
  -- Search templates (public or session-based)
  SELECT 
    'template'::text as entity_type,
    t.id as entity_id,
    t.name as title,
    COALESCE(t.description, '') as description,
    t.category as category,
    calculate_search_rank(t.search_vector, ts_query, 0.7) as search_rank,
    jsonb_build_object(
      'usage_count', t.usage_count,
      'tags', t.tags,
      'is_public', t.is_public
    ) as metadata
  FROM templates t
  WHERE t.search_vector @@ ts_query
    AND (t.is_public = true OR (session_id IS NOT NULL AND t.session_id = search_all.session_id))
  
  ORDER BY search_rank DESC, title ASC
  LIMIT limit_results OFFSET offset_results;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Product-specific search with advanced filtering
CREATE OR REPLACE FUNCTION search_products(
  search_query text DEFAULT '',
  category_filter text DEFAULT NULL,
  brand_filter text DEFAULT NULL,
  price_min decimal DEFAULT NULL,
  price_max decimal DEFAULT NULL,
  in_stock_only boolean DEFAULT false,
  sort_by text DEFAULT 'relevance',
  limit_results integer DEFAULT 50,
  offset_results integer DEFAULT 0
) RETURNS TABLE (
  id uuid,
  name text,
  category text,
  brand text,
  price decimal,
  description text,
  sku text,
  in_stock boolean,
  search_rank real,
  similarity_score real
) AS $$
DECLARE
  ts_query tsquery;
  query_text text;
BEGIN
  -- Prepare text search query if provided
  IF search_query != '' THEN
    ts_query := websearch_to_tsquery('alva_search', search_query);
  END IF;
  
  -- Build dynamic query
  query_text := '
  SELECT 
    p.id,
    p.name,
    p.category,
    p.brand,
    p.price,
    p.description,
    p.sku,
    p.in_stock,
    CASE 
      WHEN $1 != '''' THEN calculate_search_rank(p.search_vector, $2, 1.0)
      ELSE 1.0
    END as search_rank,
    CASE 
      WHEN $1 != '''' THEN greatest(
        similarity(lower(p.name), lower($1)),
        similarity(lower(coalesce(p.description, '')), lower($1))
      )
      ELSE 0.0
    END as similarity_score
  FROM products p
  WHERE p.is_active = true';
  
  -- Add search condition
  IF search_query != '' THEN
    query_text := query_text || ' AND (p.search_vector @@ $2 OR similarity(lower(p.name), lower($1)) > 0.2)';
  END IF;
  
  -- Add filters dynamically
  IF category_filter IS NOT NULL THEN
    query_text := query_text || ' AND p.category = ''' || category_filter || '''';
  END IF;
  
  IF brand_filter IS NOT NULL THEN
    query_text := query_text || ' AND p.brand ILIKE ''%' || brand_filter || '%''';
  END IF;
  
  IF price_min IS NOT NULL THEN
    query_text := query_text || ' AND p.price >= ' || price_min;
  END IF;
  
  IF price_max IS NOT NULL THEN
    query_text := query_text || ' AND p.price <= ' || price_max;
  END IF;
  
  IF in_stock_only THEN
    query_text := query_text || ' AND p.in_stock = true';
  END IF;
  
  -- Add sorting
  query_text := query_text || 
  CASE sort_by
    WHEN 'name' THEN ' ORDER BY p.name ASC'
    WHEN 'price_asc' THEN ' ORDER BY p.price ASC, p.name ASC'
    WHEN 'price_desc' THEN ' ORDER BY p.price DESC, p.name ASC'
    ELSE ' ORDER BY search_rank DESC, similarity_score DESC, p.name ASC'
  END;
  
  -- Add limits
  query_text := query_text || ' LIMIT ' || limit_results || ' OFFSET ' || offset_results;
  
  -- Execute dynamic query
  RETURN QUERY EXECUTE query_text USING search_query, ts_query;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Fuzzy search with typo tolerance
CREATE OR REPLACE FUNCTION fuzzy_product_search(
  search_query text,
  min_similarity real DEFAULT 0.3,
  limit_results integer DEFAULT 20
) RETURNS TABLE (
  id uuid,
  name text,
  category text,
  brand text,
  price decimal,
  similarity_score real,
  match_type text
) AS $$
BEGIN
  RETURN QUERY
  WITH fuzzy_matches AS (
    SELECT DISTINCT
      p.id,
      p.name,
      p.category,
      p.brand,
      p.price,
      GREATEST(
        similarity(lower(p.name), lower(search_query)),
        similarity(lower(coalesce(p.description, '')), lower(search_query)),
        similarity(COALESCE(p.brand, ''), lower(search_query))
      ) as similarity_score,
      CASE 
        WHEN similarity(lower(p.name), lower(search_query)) >= min_similarity THEN 'name_match'
        WHEN similarity(lower(coalesce(p.description, '')), lower(search_query)) >= min_similarity THEN 'description_match'
        WHEN similarity(COALESCE(p.brand, ''), lower(search_query)) >= min_similarity THEN 'brand_match'
        ELSE 'weak_match'
      END as match_type
    FROM products p
    WHERE p.is_active = true
      AND (
        similarity(lower(p.name), lower(search_query)) >= min_similarity OR
        similarity(lower(coalesce(p.description, '')), lower(search_query)) >= min_similarity OR
        similarity(COALESCE(p.brand, ''), lower(search_query)) >= min_similarity
      )
  )
  SELECT * FROM fuzzy_matches
  ORDER BY similarity_score DESC, name ASC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Search suggestions and autocomplete
CREATE OR REPLACE FUNCTION search_suggestions(
  partial_query text,
  filter_type text DEFAULT 'all',
  limit_results integer DEFAULT 10
) RETURNS TABLE (
  suggestion text,
  suggestion_type text,
  match_count integer,
  relevance_score real
) AS $$
BEGIN
  RETURN QUERY
  WITH suggestions AS (
    -- Product name suggestions
    SELECT DISTINCT
      p.name as suggestion,
      'product'::text as suggestion_type,
      1 as match_count,
      similarity(lower(p.name), lower(partial_query)) as relevance_score
    FROM products p
    WHERE p.is_active = true
      AND (filter_type = 'all' OR filter_type = 'products')
      AND similarity(lower(p.name), lower(partial_query)) > 0.3
    
    UNION ALL
    
    -- Brand suggestions
    SELECT DISTINCT
      p.brand as suggestion,
      'brand'::text as suggestion_type,
      COUNT(*)::integer as match_count,
      similarity(lower(p.brand), lower(partial_query)) as relevance_score
    FROM products p
    WHERE p.is_active = true
      AND p.brand IS NOT NULL
      AND (filter_type = 'all' OR filter_type = 'brands')
      AND similarity(lower(p.brand), lower(partial_query)) > 0.3
    GROUP BY p.brand
    
    UNION ALL
    
    -- Category suggestions
    SELECT DISTINCT
      p.category as suggestion,
      'category'::text as suggestion_type,
      COUNT(*)::integer as match_count,
      similarity(lower(p.category), lower(partial_query)) as relevance_score
    FROM products p
    WHERE p.is_active = true
      AND (filter_type = 'all' OR filter_type = 'categories')
      AND similarity(lower(p.category), lower(partial_query)) > 0.3
    GROUP BY p.category
  )
  SELECT * FROM suggestions
  WHERE suggestion IS NOT NULL
  ORDER BY relevance_score DESC, match_count DESC, suggestion ASC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ===========================================
-- SEARCH ANALYTICS & TRACKING
-- ===========================================

-- Search analytics table
CREATE TABLE IF NOT EXISTS search_analytics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text,
  search_query text NOT NULL,
  search_type text DEFAULT 'general',
  results_count integer DEFAULT 0,
  response_time_ms integer,
  clicked_result_id uuid,
  clicked_result_type text,
  clicked_result_rank integer,
  filters_applied jsonb DEFAULT '{}'::jsonb,
  sort_applied text,
  page_number integer DEFAULT 1,
  had_results boolean GENERATED ALWAYS AS (results_count > 0) STORED,
  user_clicked boolean DEFAULT false,
  created_at timestamptz DEFAULT NOW()
);

-- Search analytics indexes
CREATE INDEX IF NOT EXISTS idx_search_analytics_session ON search_analytics(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(search_query, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_success ON search_analytics(had_results, user_clicked, created_at DESC);

-- Log search queries function
CREATE OR REPLACE FUNCTION log_search_query(
  p_session_id text,
  p_search_query text,
  p_search_type text DEFAULT 'general',
  p_results_count integer DEFAULT 0,
  p_response_time_ms integer DEFAULT NULL,
  p_filters_applied jsonb DEFAULT '{}'::jsonb
) RETURNS uuid AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO search_analytics (
    session_id, search_query, search_type, results_count, 
    response_time_ms, filters_applied
  ) VALUES (
    p_session_id, p_search_query, p_search_type, p_results_count,
    p_response_time_ms, p_filters_applied
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Track search result clicks
CREATE OR REPLACE FUNCTION log_search_click(
  search_log_id uuid,
  clicked_result_id uuid,
  clicked_result_type text,
  result_rank integer DEFAULT NULL
) RETURNS boolean AS $$
BEGIN
  UPDATE search_analytics SET
    clicked_result_id = log_search_click.clicked_result_id,
    clicked_result_type = log_search_click.clicked_result_type,
    clicked_result_rank = result_rank,
    user_clicked = true
  WHERE id = search_log_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- SEARCH PERFORMANCE VIEWS
-- ===========================================

-- Search performance metrics
CREATE OR REPLACE VIEW search_performance AS
SELECT 
  search_type,
  DATE_TRUNC('day', created_at) as search_date,
  COUNT(*) as total_searches,
  COUNT(*) FILTER (WHERE had_results) as successful_searches,
  COUNT(*) FILTER (WHERE user_clicked) as searches_with_clicks,
  ROUND(AVG(response_time_ms), 2) as avg_response_time_ms,
  ROUND(AVG(results_count), 2) as avg_results_count,
  ROUND(
    COUNT(*) FILTER (WHERE had_results)::decimal / 
    NULLIF(COUNT(*), 0) * 100, 2
  ) as success_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE user_clicked)::decimal / 
    NULLIF(COUNT(*) FILTER (WHERE had_results), 0) * 100, 2
  ) as click_through_rate_pct
FROM search_analytics
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY search_type, DATE_TRUNC('day', created_at)
ORDER BY search_date DESC, search_type;

-- Popular search terms
CREATE OR REPLACE VIEW popular_search_terms AS
SELECT 
  search_query,
  search_type,
  COUNT(*) as search_count,
  COUNT(*) FILTER (WHERE had_results) as successful_count,
  COUNT(*) FILTER (WHERE user_clicked) as clicked_count,
  ROUND(AVG(results_count), 1) as avg_results,
  ROUND(
    COUNT(*) FILTER (WHERE had_results)::decimal / 
    NULLIF(COUNT(*), 0) * 100, 1
  ) as success_rate_pct,
  MAX(created_at) as last_searched
FROM search_analytics
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND length(trim(search_query)) >= 3
GROUP BY search_query, search_type
HAVING COUNT(*) >= 2
ORDER BY search_count DESC, success_rate_pct DESC
LIMIT 100;

-- ===========================================
-- SEARCH RESULT CACHING
-- ===========================================

-- Search results cache table
CREATE TABLE IF NOT EXISTS search_cache (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key text UNIQUE NOT NULL,
  search_query text NOT NULL,
  search_params jsonb NOT NULL,
  results_data jsonb NOT NULL,
  results_count integer NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  accessed_at timestamptz DEFAULT NOW(),
  access_count integer DEFAULT 1,
  expires_at timestamptz DEFAULT NOW() + INTERVAL '1 hour'
);

-- Cache indexes
CREATE INDEX IF NOT EXISTS idx_search_cache_key ON search_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_search_cache_expiry ON search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_accessed ON search_cache(accessed_at);

-- Generate cache key function
CREATE OR REPLACE FUNCTION generate_search_cache_key(
  search_query text,
  search_params jsonb
) RETURNS text AS $$
BEGIN
  RETURN encode(
    digest(
      search_query || search_params::text, 
      'sha256'
    ), 
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get cached search results
CREATE OR REPLACE FUNCTION get_cached_search_results(
  cache_key text
) RETURNS jsonb AS $$
DECLARE
  cached_data jsonb;
BEGIN
  SELECT results_data INTO cached_data
  FROM search_cache
  WHERE search_cache.cache_key = get_cached_search_results.cache_key
    AND expires_at > NOW();
  
  IF FOUND THEN
    UPDATE search_cache SET
      accessed_at = NOW(),
      access_count = access_count + 1
    WHERE search_cache.cache_key = get_cached_search_results.cache_key;
  END IF;
  
  RETURN cached_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cache search results
CREATE OR REPLACE FUNCTION cache_search_results(
  cache_key text,
  search_query text,
  search_params jsonb,
  results_data jsonb,
  results_count integer,
  cache_duration interval DEFAULT '1 hour'::interval
) RETURNS boolean AS $$
BEGIN
  INSERT INTO search_cache (
    cache_key, search_query, search_params, results_data, 
    results_count, expires_at
  ) VALUES (
    cache_key, search_query, search_params, results_data,
    results_count, NOW() + cache_duration
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    results_data = EXCLUDED.results_data,
    results_count = EXCLUDED.results_count,
    accessed_at = NOW(),
    expires_at = NOW() + cache_duration;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired cache entries
CREATE OR REPLACE FUNCTION cleanup_search_cache() RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM search_cache WHERE expires_at <= NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- SEARCH INDEX OPTIMIZATION
-- ===========================================

-- Rebuild search indexes function
CREATE OR REPLACE FUNCTION rebuild_search_indexes() RETURNS jsonb AS $$
DECLARE
  start_time timestamptz;
  rebuild_stats jsonb;
BEGIN
  start_time := NOW();
  
  -- Update table statistics
  ANALYZE products;
  ANALYZE customers;
  ANALYZE quotes;
  ANALYZE templates;
  
  rebuild_stats := jsonb_build_object(
    'rebuild_start', start_time,
    'rebuild_end', NOW(),
    'rebuild_duration', EXTRACT(EPOCH FROM (NOW() - start_time)),
    'tables_analyzed', ARRAY['products', 'customers', 'quotes', 'templates']
  );
  
  RETURN rebuild_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Search index health check
CREATE OR REPLACE FUNCTION check_search_index_health() RETURNS TABLE (
  table_name text,
  index_name text,
  index_size text,
  recommendations text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname || '.' || tablename as table_name,
    indexname as index_name,
    pg_size_pretty(pg_total_relation_size(indexrelid)) as index_size,
    CASE 
      WHEN idx_tup_read > 0 AND idx_tup_fetch / GREATEST(idx_tup_read, 1) < 0.1 THEN ARRAY['low_usage']
      ELSE ARRAY['healthy']
    END as recommendations
  FROM pg_stat_user_indexes
  WHERE indexname LIKE '%search%' OR indexname LIKE '%trgm%'
  ORDER BY pg_total_relation_size(indexrelid) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Search optimization migration completed successfully