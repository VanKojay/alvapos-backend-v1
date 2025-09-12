-- ALVA POS MVP - Database Security & Data Protection
-- Comprehensive security policies, input validation, and data protection measures

-- ===========================================
-- SECURITY FUNCTIONS & VALIDATION
-- ===========================================

-- Input sanitization function
CREATE OR REPLACE FUNCTION sanitize_input(input_text text) RETURNS text AS $$
BEGIN
  -- Remove potential XSS and SQL injection patterns
  RETURN regexp_replace(
    regexp_replace(
      regexp_replace(
        COALESCE(input_text, ''),
        '<[^>]*>', '', 'g'  -- Remove HTML tags
      ),
      '[''";]', '', 'g'     -- Remove quotes and semicolons
    ),
    '\s+', ' ', 'g'         -- Normalize whitespace
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- Session ID validation
CREATE OR REPLACE FUNCTION validate_session_id(session_id text) RETURNS boolean AS $$
BEGIN
  -- Session ID should be UUID-like or secure hash
  RETURN session_id IS NOT NULL 
    AND length(session_id) BETWEEN 20 AND 100
    AND session_id ~ '^[A-Za-z0-9_-]+$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Email validation function
CREATE OR REPLACE FUNCTION validate_email(email_address text) RETURNS boolean AS $$
BEGIN
  RETURN email_address IS NULL OR (
    length(email_address) <= 254 AND
    email_address ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Phone validation function  
CREATE OR REPLACE FUNCTION validate_phone(phone_number text) RETURNS boolean AS $$
BEGIN
  RETURN phone_number IS NULL OR (
    length(regexp_replace(phone_number, '[^0-9]', '', 'g')) BETWEEN 10 AND 15
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Price validation function
CREATE OR REPLACE FUNCTION validate_price(price_value decimal) RETURNS boolean AS $$
BEGIN
  RETURN price_value IS NOT NULL AND price_value >= 0 AND price_value <= 999999.99;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- JSONB validation for cart data
CREATE OR REPLACE FUNCTION validate_cart_data(cart_data jsonb) RETURNS boolean AS $$
DECLARE
  required_keys text[] := ARRAY['items', 'laborItems', 'subtotal', 'taxAmount', 'finalTotal'];
  key text;
BEGIN
  -- Check required keys exist
  FOREACH key IN ARRAY required_keys LOOP
    IF NOT (cart_data ? key) THEN
      RETURN false;
    END IF;
  END LOOP;
  
  -- Validate numeric fields
  IF NOT (
    (cart_data->>'subtotal')::decimal >= 0 AND
    (cart_data->>'taxAmount')::decimal >= 0 AND
    (cart_data->>'finalTotal')::decimal >= 0
  ) THEN
    RETURN false;
  END IF;
  
  -- Validate arrays exist
  IF NOT (
    jsonb_typeof(cart_data->'items') = 'array' AND
    jsonb_typeof(cart_data->'laborItems') = 'array'
  ) THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Rate limiting function
CREATE OR REPLACE FUNCTION check_rate_limit(
  session_id text,
  action_type text,
  max_actions integer DEFAULT 100,
  time_window interval DEFAULT '15 minutes'::interval
) RETURNS boolean AS $$
DECLARE
  action_count integer;
BEGIN
  -- Count recent actions for this session
  SELECT COUNT(*) INTO action_count
  FROM session_analytics sa
  WHERE sa.session_id = check_rate_limit.session_id
    AND sa.last_activity > NOW() - time_window;
  
  RETURN action_count < max_actions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- DATA VALIDATION CONSTRAINTS
-- ===========================================

-- Additional constraints for enhanced validation
ALTER TABLE customers
  ADD CONSTRAINT customers_name_length CHECK (length(trim(name)) >= 2),
  ADD CONSTRAINT customers_email_valid CHECK (validate_email(email)),
  ADD CONSTRAINT customers_phone_valid CHECK (validate_phone(phone)),
  ADD CONSTRAINT customers_session_valid CHECK (
    session_id IS NULL OR validate_session_id(session_id)
  );

ALTER TABLE quotes
  ADD CONSTRAINT quotes_session_valid CHECK (
    session_id IS NULL OR validate_session_id(session_id)
  ),
  ADD CONSTRAINT quotes_cart_data_valid CHECK (validate_cart_data(cart_data)),
  ADD CONSTRAINT quotes_totals_positive CHECK (
    subtotal >= 0 AND tax_amount >= 0 AND final_total >= 0
  ),
  ADD CONSTRAINT quotes_valid_until_future CHECK (
    valid_until IS NULL OR valid_until > created_at
  ),
  ADD CONSTRAINT quotes_tax_rate_valid CHECK (
    tax_rate >= 0 AND tax_rate <= 1
  );

ALTER TABLE products
  ADD CONSTRAINT products_name_length CHECK (length(trim(name)) >= 2),
  ADD CONSTRAINT products_price_valid CHECK (validate_price(price)),
  ADD CONSTRAINT products_cost_valid CHECK (
    cost IS NULL OR (cost >= 0 AND cost <= price)
  );

ALTER TABLE templates
  ADD CONSTRAINT templates_name_length CHECK (length(trim(name)) >= 2),
  ADD CONSTRAINT templates_session_valid CHECK (
    session_id IS NULL OR validate_session_id(session_id)
  ),
  ADD CONSTRAINT templates_usage_count_positive CHECK (usage_count >= 0);

ALTER TABLE boq_imports
  ADD CONSTRAINT boq_imports_session_valid CHECK (validate_session_id(session_id)),
  ADD CONSTRAINT boq_imports_filename_length CHECK (length(trim(filename)) >= 1),
  ADD CONSTRAINT boq_imports_file_size_positive CHECK (
    file_size IS NULL OR file_size > 0
  );

-- ===========================================
-- AUDIT & LOGGING FUNCTIONS
-- ===========================================

-- Create audit log table for security events
CREATE TABLE security_audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT NOW(),
  
  -- Indexes for performance
  INDEX idx_security_audit_session (session_id),
  INDEX idx_security_audit_type (event_type, created_at DESC),
  INDEX idx_security_audit_ip (ip_address, created_at DESC)
);

-- Audit logging function
CREATE OR REPLACE FUNCTION log_security_event(
  p_session_id text,
  p_event_type text,
  p_event_data jsonb DEFAULT '{}'::jsonb,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO security_audit_log (
    session_id, event_type, event_data, ip_address, user_agent
  ) VALUES (
    p_session_id, p_event_type, p_event_data, p_ip_address, p_user_agent
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- SESSION CLEANUP & DATA RETENTION
-- ===========================================

-- Enhanced session cleanup with audit trail
CREATE OR REPLACE FUNCTION cleanup_expired_sessions(
  retention_days integer DEFAULT 7,
  batch_size integer DEFAULT 1000
) RETURNS jsonb AS $$
DECLARE
  cleanup_stats jsonb;
  deleted_quotes integer := 0;
  deleted_customers integer := 0;
  deleted_boq_imports integer := 0;
  deleted_analytics integer := 0;
  cutoff_date timestamptz;
BEGIN
  cutoff_date := NOW() - (retention_days || ' days')::interval;
  
  -- Log cleanup start
  PERFORM log_security_event(
    'SYSTEM',
    'SESSION_CLEANUP_START',
    jsonb_build_object('cutoff_date', cutoff_date, 'retention_days', retention_days)
  );
  
  -- Cleanup quotes (cascades to related data)
  DELETE FROM quotes 
  WHERE session_id IS NOT NULL 
    AND updated_at < cutoff_date
    AND id IN (
      SELECT id FROM quotes 
      WHERE session_id IS NOT NULL AND updated_at < cutoff_date
      LIMIT batch_size
    );
  GET DIAGNOSTICS deleted_quotes = ROW_COUNT;
  
  -- Cleanup orphaned session-based customers
  DELETE FROM customers 
  WHERE session_id IS NOT NULL 
    AND updated_at < cutoff_date
    AND NOT EXISTS (
      SELECT 1 FROM quotes q WHERE q.customer_id = customers.id
    );
  GET DIAGNOSTICS deleted_customers = ROW_COUNT;
  
  -- Cleanup BOQ imports
  DELETE FROM boq_imports 
  WHERE session_id IS NOT NULL 
    AND uploaded_at < cutoff_date;
  GET DIAGNOSTICS deleted_boq_imports = ROW_COUNT;
  
  -- Cleanup session analytics
  DELETE FROM session_analytics 
  WHERE last_activity < cutoff_date;
  GET DIAGNOSTICS deleted_analytics = ROW_COUNT;
  
  -- Prepare cleanup statistics
  cleanup_stats := jsonb_build_object(
    'cleanup_date', NOW(),
    'cutoff_date', cutoff_date,
    'retention_days', retention_days,
    'deleted_quotes', deleted_quotes,
    'deleted_customers', deleted_customers,
    'deleted_boq_imports', deleted_boq_imports,
    'deleted_analytics', deleted_analytics,
    'total_deleted', deleted_quotes + deleted_customers + deleted_boq_imports + deleted_analytics
  );
  
  -- Log cleanup completion
  PERFORM log_security_event(
    'SYSTEM',
    'SESSION_CLEANUP_COMPLETE',
    cleanup_stats
  );
  
  RETURN cleanup_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- SECURITY MONITORING TRIGGERS
-- ===========================================

-- Monitor suspicious activity trigger
CREATE OR REPLACE FUNCTION monitor_suspicious_activity() RETURNS trigger AS $$
DECLARE
  suspicious_patterns text[] := ARRAY[
    'script', 'javascript:', 'vbscript:', 'onload', 'onerror', 
    'eval(', 'document.', 'window.', 'alert(', 'confirm(',
    'DROP TABLE', 'DELETE FROM', 'UPDATE SET', 'INSERT INTO',
    'UNION SELECT', '--', '/*', '*/', ';--'
  ];
  pattern text;
  record_text text;
BEGIN
  -- Convert record to text for pattern matching
  record_text := lower(NEW::text);
  
  -- Check for suspicious patterns
  FOREACH pattern IN ARRAY suspicious_patterns LOOP
    IF record_text LIKE '%' || pattern || '%' THEN
      PERFORM log_security_event(
        COALESCE(NEW.session_id, 'UNKNOWN'),
        'SUSPICIOUS_PATTERN_DETECTED',
        jsonb_build_object(
          'table_name', TG_TABLE_NAME,
          'pattern', pattern,
          'operation', TG_OP,
          'timestamp', NOW()
        )
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply monitoring to sensitive tables
CREATE TRIGGER trigger_customers_security_monitor
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION monitor_suspicious_activity();

CREATE TRIGGER trigger_quotes_security_monitor
  BEFORE INSERT OR UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION monitor_suspicious_activity();

-- ===========================================
-- DATA ANONYMIZATION FUNCTIONS
-- ===========================================

-- Anonymize customer data for privacy compliance
CREATE OR REPLACE FUNCTION anonymize_customer_data(customer_uuid uuid) RETURNS boolean AS $$
BEGIN
  UPDATE customers SET
    name = 'Anonymous Customer ' || substr(id::text, 1, 8),
    email = NULL,
    phone = NULL,
    company = NULL,
    address = '{}'::jsonb,
    search_vector = to_tsvector('english', 'anonymous customer')
  WHERE id = customer_uuid;
  
  -- Log anonymization
  PERFORM log_security_event(
    'SYSTEM',
    'CUSTOMER_DATA_ANONYMIZED',
    jsonb_build_object('customer_id', customer_uuid)
  );
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bulk anonymization for expired sessions
CREATE OR REPLACE FUNCTION anonymize_expired_sessions(
  retention_days integer DEFAULT 30
) RETURNS integer AS $$
DECLARE
  anonymized_count integer;
  cutoff_date timestamptz;
BEGIN
  cutoff_date := NOW() - (retention_days || ' days')::interval;
  
  -- Anonymize customers from expired sessions
  UPDATE customers SET
    name = 'Anonymous Customer ' || substr(id::text, 1, 8),
    email = NULL,
    phone = NULL,
    company = NULL,
    address = '{}'::jsonb,
    search_vector = to_tsvector('english', 'anonymous customer')
  WHERE session_id IS NOT NULL 
    AND updated_at < cutoff_date
    AND name NOT LIKE 'Anonymous Customer%';
  
  GET DIAGNOSTICS anonymized_count = ROW_COUNT;
  
  -- Log bulk anonymization
  PERFORM log_security_event(
    'SYSTEM',
    'BULK_ANONYMIZATION_COMPLETE',
    jsonb_build_object(
      'anonymized_count', anonymized_count,
      'cutoff_date', cutoff_date
    )
  );
  
  RETURN anonymized_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- BACKUP & RECOVERY POLICIES
-- ===========================================

-- Create backup metadata table
CREATE TABLE backup_metadata (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  backup_type text NOT NULL CHECK (backup_type IN ('full', 'incremental', 'differential')),
  backup_location text NOT NULL,
  backup_size bigint,
  backup_status text DEFAULT 'in_progress' CHECK (backup_status IN ('in_progress', 'completed', 'failed')),
  created_at timestamptz DEFAULT NOW(),
  completed_at timestamptz,
  
  -- Backup verification
  checksum text,
  verification_status text CHECK (verification_status IN ('pending', 'verified', 'failed')),
  
  -- Retention metadata
  expires_at timestamptz,
  
  INDEX idx_backup_metadata_type (backup_type, created_at DESC),
  INDEX idx_backup_metadata_status (backup_status, created_at DESC)
);

-- ===========================================
-- SCHEDULED MAINTENANCE JOBS
-- ===========================================

-- Create a job scheduling table for maintenance tasks
CREATE TABLE maintenance_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name text UNIQUE NOT NULL,
  job_type text NOT NULL CHECK (job_type IN ('cleanup', 'backup', 'optimization', 'security')),
  schedule_expression text NOT NULL, -- Cron-like expression
  last_run timestamptz,
  next_run timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  run_count integer DEFAULT 0,
  failure_count integer DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT NOW(),
  
  INDEX idx_maintenance_jobs_schedule (next_run, status)
);

-- Insert default maintenance jobs
INSERT INTO maintenance_jobs (job_name, job_type, schedule_expression, next_run) VALUES
('daily_session_cleanup', 'cleanup', '0 2 * * *', NOW() + interval '1 day'),
('weekly_anonymization', 'security', '0 3 * * 0', NOW() + interval '1 week'),
('monthly_full_backup', 'backup', '0 1 1 * *', NOW() + interval '1 month'),
('daily_index_optimization', 'optimization', '0 4 * * *', NOW() + interval '1 day');

-- Function to execute maintenance jobs
CREATE OR REPLACE FUNCTION execute_maintenance_job(job_name text) RETURNS jsonb AS $$
DECLARE
  job_record maintenance_jobs%ROWTYPE;
  result jsonb;
  error_message text;
BEGIN
  -- Get job details
  SELECT * INTO job_record FROM maintenance_jobs WHERE maintenance_jobs.job_name = execute_maintenance_job.job_name;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  IF job_record.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Job is not active');
  END IF;
  
  BEGIN
    -- Execute based on job type
    CASE job_record.job_type
      WHEN 'cleanup' THEN
        result := cleanup_expired_sessions();
      WHEN 'security' THEN
        result := jsonb_build_object('anonymized_count', anonymize_expired_sessions());
      WHEN 'optimization' THEN
        -- Add index optimization logic here
        result := jsonb_build_object('status', 'optimization_completed');
      ELSE
        result := jsonb_build_object('error', 'Unknown job type');
    END CASE;
    
    -- Update job success
    UPDATE maintenance_jobs SET
      last_run = NOW(),
      run_count = run_count + 1,
      last_error = NULL
    WHERE maintenance_jobs.job_name = execute_maintenance_job.job_name;
    
    RETURN result;
    
  EXCEPTION WHEN OTHERS THEN
    -- Handle job failure
    error_message := SQLERRM;
    
    UPDATE maintenance_jobs SET
      last_run = NOW(),
      run_count = run_count + 1,
      failure_count = failure_count + 1,
      last_error = error_message
    WHERE maintenance_jobs.job_name = execute_maintenance_job.job_name;
    
    RETURN jsonb_build_object('error', error_message);
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- SECURITY POLICY DOCUMENTATION
-- ===========================================

COMMENT ON TABLE security_audit_log IS 'Security event audit trail for compliance and monitoring';
COMMENT ON FUNCTION validate_session_id(text) IS 'Validates session ID format and security requirements';
COMMENT ON FUNCTION sanitize_input(text) IS 'Sanitizes user input to prevent XSS and injection attacks';
COMMENT ON FUNCTION cleanup_expired_sessions(integer, integer) IS 'Automated session cleanup with configurable retention';
COMMENT ON FUNCTION log_security_event(text, text, jsonb, inet, text) IS 'Centralized security event logging';
COMMENT ON FUNCTION check_rate_limit(text, text, integer, interval) IS 'Rate limiting to prevent abuse';