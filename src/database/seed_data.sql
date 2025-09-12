-- ALVA POS MVP - Sample Seed Data
-- Sample products, customers, and test data for API validation

-- Insert sample products across all categories
INSERT INTO products (sku, name, category, subcategory, price, cost, description, specifications, brand, model, image_url, sort_order) VALUES
-- Cameras
('CAM001', '4K Dome Security Camera', 'cameras', 'dome', 299.99, 150.00, '4K Ultra HD dome camera with night vision and weatherproof housing', '[{"name": "Resolution", "value": "4K", "unit": "pixels"}, {"name": "Night Vision", "value": "30m", "unit": "meters"}, {"name": "Housing", "value": "IP67", "unit": "rating"}]', 'SecureTech', 'ST-4K-DOME-01', '/images/cameras/4k-dome-camera.jpg', 1),

('CAM002', '1080p Bullet Camera', 'cameras', 'bullet', 189.99, 95.00, 'Full HD bullet camera with infrared LEDs and metal housing', '[{"name": "Resolution", "value": "1080p", "unit": "pixels"}, {"name": "Night Vision", "value": "20m", "unit": "meters"}, {"name": "Housing", "value": "IP66", "unit": "rating"}]', 'SecureTech', 'ST-1080-BULLET-02', '/images/cameras/1080p-bullet-camera.jpg', 2),

('CAM003', 'PTZ Security Camera', 'cameras', 'ptz', 899.99, 450.00, 'Pan-Tilt-Zoom camera with 30x optical zoom and auto-tracking', '[{"name": "Resolution", "value": "4K", "unit": "pixels"}, {"name": "Zoom", "value": "30x", "unit": "optical"}, {"name": "Rotation", "value": "360°", "unit": "degrees"}]', 'ProVision', 'PV-PTZ-4K-30X', '/images/cameras/ptz-camera.jpg', 3),

('CAM004', 'Wireless IP Camera', 'cameras', 'wireless', 159.99, 80.00, 'WiFi enabled IP camera with mobile app support', '[{"name": "Resolution", "value": "2MP", "unit": "pixels"}, {"name": "Connectivity", "value": "WiFi 802.11n", "unit": ""}, {"name": "Power", "value": "12V DC", "unit": ""}]', 'WifiCam', 'WC-2MP-WIFI', '/images/cameras/wireless-ip-camera.jpg', 4),

-- Recorders
('REC001', '8-Channel NVR', 'recorders', 'nvr', 449.99, 225.00, '8-channel Network Video Recorder with 2TB storage', '[{"name": "Channels", "value": "8", "unit": "channels"}, {"name": "Storage", "value": "2TB", "unit": "HDD"}, {"name": "Resolution", "value": "4K", "unit": "support"}]', 'RecordPro', 'RP-NVR-8CH-2TB', '/images/recorders/8ch-nvr.jpg', 1),

('REC002', '16-Channel DVR', 'recorders', 'dvr', 599.99, 300.00, '16-channel Digital Video Recorder with H.265 compression', '[{"name": "Channels", "value": "16", "unit": "channels"}, {"name": "Compression", "value": "H.265", "unit": ""}, {"name": "Storage", "value": "4TB", "unit": "HDD"}]', 'RecordPro', 'RP-DVR-16CH-4TB', '/images/recorders/16ch-dvr.jpg', 2),

('REC003', '32-Channel Enterprise NVR', 'recorders', 'nvr', 1299.99, 650.00, 'High-end 32-channel NVR for large installations', '[{"name": "Channels", "value": "32", "unit": "channels"}, {"name": "Storage", "value": "8TB", "unit": "RAID"}, {"name": "Bandwidth", "value": "320Mbps", "unit": ""}]', 'EnterpriseSec', 'ES-NVR-32CH-RAID', '/images/recorders/32ch-enterprise-nvr.jpg', 3),

-- Storage
('STO001', '2TB Surveillance HDD', 'storage', 'hdd', 129.99, 65.00, 'Purpose-built hard drive for 24/7 surveillance recording', '[{"name": "Capacity", "value": "2TB", "unit": ""}, {"name": "RPM", "value": "7200", "unit": "rpm"}, {"name": "Cache", "value": "128MB", "unit": ""}]', 'SurveillanceDrive', 'SD-2TB-7200', '/images/storage/2tb-surveillance-hdd.jpg', 1),

('STO002', '4TB Purple Drive', 'storage', 'hdd', 189.99, 95.00, '4TB surveillance-optimized hard drive', '[{"name": "Capacity", "value": "4TB", "unit": ""}, {"name": "RPM", "value": "5400", "unit": "rpm"}, {"name": "Workload", "value": "180TB/year", "unit": ""}]', 'PurpleTech', 'PT-4TB-PURPLE', '/images/storage/4tb-purple-drive.jpg', 2),

('STO003', '1TB SSD', 'storage', 'ssd', 299.99, 150.00, 'High-speed SSD for critical surveillance data', '[{"name": "Capacity", "value": "1TB", "unit": ""}, {"name": "Interface", "value": "SATA III", "unit": ""}, {"name": "Speed", "value": "550MB/s", "unit": "read"}]', 'FastStorage', 'FS-1TB-SSD', '/images/storage/1tb-ssd.jpg', 3),

-- Network
('NET001', '8-Port PoE Switch', 'network', 'switch', 199.99, 100.00, '8-port Power over Ethernet switch for IP cameras', '[{"name": "Ports", "value": "8", "unit": "PoE ports"}, {"name": "Power Budget", "value": "120W", "unit": ""}, {"name": "Speed", "value": "Gigabit", "unit": ""}]', 'NetPower', 'NP-8POE-120W', '/images/network/8port-poe-switch.jpg', 1),

('NET002', '16-Port Managed Switch', 'network', 'switch', 399.99, 200.00, '16-port managed switch with VLAN support', '[{"name": "Ports", "value": "16", "unit": "ports"}, {"name": "Management", "value": "Web GUI", "unit": ""}, {"name": "VLAN", "value": "4096", "unit": "supported"}]', 'NetPro', 'NP-16M-VLAN', '/images/network/16port-managed-switch.jpg', 2),

('NET003', 'WiFi Router AC1750', 'network', 'router', 129.99, 65.00, 'Dual-band wireless router for surveillance network', '[{"name": "Speed", "value": "AC1750", "unit": ""}, {"name": "Bands", "value": "Dual", "unit": ""}, {"name": "Antennas", "value": "3", "unit": "external"}]', 'WifiNet', 'WN-AC1750-R3', '/images/network/wifi-router-ac1750.jpg', 3),

-- Power
('POW001', '12V 5A Power Supply', 'power', 'adapter', 29.99, 15.00, 'Regulated power supply for security cameras', '[{"name": "Output", "value": "12V DC", "unit": ""}, {"name": "Current", "value": "5A", "unit": ""}, {"name": "Efficiency", "value": "85%", "unit": ""}]', 'PowerTech', 'PT-12V-5A', '/images/power/12v-5a-adapter.jpg', 1),

('POW002', 'UPS 1500VA', 'power', 'ups', 199.99, 100.00, 'Uninterruptible Power Supply for surveillance systems', '[{"name": "Capacity", "value": "1500VA", "unit": ""}, {"name": "Runtime", "value": "15min", "unit": "full load"}, {"name": "Outlets", "value": "8", "unit": ""}]', 'BackupPower', 'BP-1500VA-UPS', '/images/power/ups-1500va.jpg', 2),

('POW003', 'PoE Injector 60W', 'power', 'injector', 39.99, 20.00, '60W PoE+ injector for high-power IP cameras', '[{"name": "Power", "value": "60W", "unit": "PoE+"}, {"name": "Standard", "value": "802.3at", "unit": ""}, {"name": "Efficiency", "value": "90%", "unit": ""}]', 'PoEPower', 'PP-60W-INJ', '/images/power/poe-injector-60w.jpg', 3),

-- Accessories
('ACC001', '100ft CAT6 Cable', 'accessories', 'cable', 49.99, 25.00, 'Category 6 ethernet cable for IP camera installation', '[{"name": "Length", "value": "100ft", "unit": ""}, {"name": "Category", "value": "CAT6", "unit": ""}, {"name": "Shielding", "value": "UTP", "unit": ""}]', 'CableTech', 'CT-CAT6-100FT', '/images/accessories/cat6-cable-100ft.jpg', 1),

('ACC002', 'Camera Mount Bracket', 'accessories', 'mount', 19.99, 10.00, 'Universal mounting bracket for dome and bullet cameras', '[{"name": "Material", "value": "Aluminum", "unit": ""}, {"name": "Load", "value": "5kg", "unit": "max"}, {"name": "Adjustment", "value": "360°", "unit": ""}]', 'MountPro', 'MP-UNIVERSAL-BRACKET', '/images/accessories/camera-mount-bracket.jpg', 2),

('ACC003', 'BNC Connector Pack', 'accessories', 'connector', 14.99, 7.50, 'Pack of 10 BNC connectors for coax cable', '[{"name": "Quantity", "value": "10", "unit": "pieces"}, {"name": "Type", "value": "BNC Male", "unit": ""}, {"name": "Cable", "value": "RG59", "unit": "compatible"}]', 'ConnectorPlus', 'CP-BNC-MALE-10', '/images/accessories/bnc-connector-pack.jpg', 3),

('ACC004', 'Junction Box Waterproof', 'accessories', 'box', 24.99, 12.50, 'Waterproof junction box for outdoor camera connections', '[{"name": "Rating", "value": "IP65", "unit": ""}, {"name": "Material", "value": "Aluminum", "unit": ""}, {"name": "Size", "value": "4x4x2", "unit": "inches"}]', 'WeatherGuard', 'WG-JBOX-IP65', '/images/accessories/waterproof-junction-box.jpg', 4);

-- Insert sample customers for testing
INSERT INTO customers (name, email, phone, company, address, total_quotes) VALUES
('John Smith', 'john.smith@email.com', '+1-555-0123', 'Smith Retail Store', '{"street": "123 Main St", "city": "Anytown", "state": "CA", "postal_code": "90210", "country": "USA"}', 0),

('Sarah Johnson', 'sarah.j@techcorp.com', '+1-555-0234', 'TechCorp Inc', '{"street": "456 Business Blvd", "city": "Corporate City", "state": "NY", "postal_code": "10001", "country": "USA"}', 0),

('Michael Brown', 'mike.brown@warehouse.net', '+1-555-0345', 'Brown Warehouse', '{"street": "789 Industrial Ave", "city": "Factory Town", "state": "TX", "postal_code": "75001", "country": "USA"}', 0),

('Lisa Davis', 'lisa.davis@restaurant.com', '+1-555-0456', 'Davis Family Restaurant', '{"street": "321 Food St", "city": "Dining City", "state": "FL", "postal_code": "33101", "country": "USA"}', 0),

('Robert Wilson', 'r.wilson@offices.biz', '+1-555-0567', 'Wilson Professional Offices', '{"street": "654 Office Park Dr", "city": "Business Hub", "state": "IL", "postal_code": "60601", "country": "USA"}', 0);

-- Create some sample templates for testing
INSERT INTO templates (name, description, category, template_data, tags, is_public, usage_count, created_by) VALUES
('Basic 4-Camera System', 'Standard 4-camera surveillance setup for small retail', 'retail', '{
  "items": [
    {"productId": "CAM001", "name": "4K Dome Security Camera", "category": "cameras", "price": 299.99, "quantity": 4, "specs": {"resolution": "4K", "type": "dome"}},
    {"productId": "REC001", "name": "8-Channel NVR", "category": "recorders", "price": 449.99, "quantity": 1, "specs": {"channels": "8", "storage": "2TB"}},
    {"productId": "NET001", "name": "8-Port PoE Switch", "category": "network", "price": 199.99, "quantity": 1, "specs": {"ports": "8", "power": "120W"}},
    {"productId": "ACC001", "name": "100ft CAT6 Cable", "category": "accessories", "price": 49.99, "quantity": 4, "specs": {"length": "100ft", "category": "CAT6"}}
  ],
  "laborItems": [
    {"type": "installation", "name": "Camera Installation", "description": "Mount and configure cameras", "rateType": "hourly", "rate": 75.00, "quantity": 8, "unit": "hours", "category": "installation"},
    {"type": "commissioning", "name": "System Commissioning", "description": "System setup and testing", "rateType": "fixed", "rate": 200.00, "quantity": 1, "unit": "job", "category": "setup"}
  ]
}', '["retail", "basic", "4-camera", "dome"]', true, 5, 'system'),

('Enterprise 16-Camera Setup', 'Large enterprise surveillance system with PTZ cameras', 'enterprise', '{
  "items": [
    {"productId": "CAM001", "name": "4K Dome Security Camera", "category": "cameras", "price": 299.99, "quantity": 12, "specs": {"resolution": "4K", "type": "dome"}},
    {"productId": "CAM003", "name": "PTZ Security Camera", "category": "cameras", "price": 899.99, "quantity": 4, "specs": {"resolution": "4K", "zoom": "30x"}},
    {"productId": "REC003", "name": "32-Channel Enterprise NVR", "category": "recorders", "price": 1299.99, "quantity": 1, "specs": {"channels": "32", "storage": "8TB"}},
    {"productId": "NET002", "name": "16-Port Managed Switch", "category": "network", "price": 399.99, "quantity": 2, "specs": {"ports": "16", "managed": true}}
  ],
  "laborItems": [
    {"type": "installation", "name": "Camera Installation", "description": "Professional camera mounting", "rateType": "hourly", "rate": 85.00, "quantity": 24, "unit": "hours", "category": "installation"},
    {"type": "commissioning", "name": "Enterprise Commissioning", "description": "Complete system setup and training", "rateType": "fixed", "rate": 800.00, "quantity": 1, "unit": "job", "category": "setup"},
    {"type": "consultation", "name": "Site Survey", "description": "Professional site assessment", "rateType": "fixed", "rate": 300.00, "quantity": 1, "unit": "job", "category": "consulting"}
  ]
}', '["enterprise", "16-camera", "ptz", "managed"]', true, 8, 'system'),

('Home Security Package', 'Basic home security system with wireless cameras', 'residential', '{
  "items": [
    {"productId": "CAM004", "name": "Wireless IP Camera", "category": "cameras", "price": 159.99, "quantity": 4, "specs": {"resolution": "2MP", "wireless": true}},
    {"productId": "REC001", "name": "8-Channel NVR", "category": "recorders", "price": 449.99, "quantity": 1, "specs": {"channels": "8", "storage": "2TB"}},
    {"productId": "NET003", "name": "WiFi Router AC1750", "category": "network", "price": 129.99, "quantity": 1, "specs": {"speed": "AC1750", "bands": "dual"}}
  ],
  "laborItems": [
    {"type": "installation", "name": "Home Installation", "description": "Residential camera setup", "rateType": "hourly", "rate": 65.00, "quantity": 6, "unit": "hours", "category": "installation"},
    {"type": "commissioning", "name": "Home System Setup", "description": "System configuration and user training", "rateType": "fixed", "rate": 150.00, "quantity": 1, "unit": "job", "category": "setup"}
  ]
}', '["residential", "home", "wireless", "basic"]', true, 12, 'system');

-- Insert sample analytics data
INSERT INTO session_analytics (session_id, page_views, cart_additions, quotes_created, templates_used, search_queries) VALUES
('test_session_001', 25, 8, 2, 1, 5),
('test_session_002', 18, 12, 3, 2, 8),
('test_session_003', 31, 15, 1, 0, 12);

-- Update search vectors for all inserted data (triggers should handle this, but ensure it's done)
UPDATE products SET updated_at = NOW();
UPDATE customers SET updated_at = NOW();
UPDATE templates SET updated_at = NOW();