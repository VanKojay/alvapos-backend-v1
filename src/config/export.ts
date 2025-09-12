// ALVA POS MVP - Simplified Export Configuration
// Basic configuration for MVP export functionality

import path from 'path';

// Simple export configuration for MVP
export const EXPORT_CONFIG = {
  // Basic file storage
  storage: {
    directory: path.join(process.cwd(), 'exports'),
    maxFileSize: 10 * 1024 * 1024, // 10MB max
    cleanup: {
      enabled: true,
      retentionHours: 24, // Clean up files after 24 hours
    },
  },

  // Basic security settings
  security: {
    allowedFormats: ['pdf', 'excel'] as const,
    requireAuth: false, // Disabled for MVP
    maxDownloads: 10,
  },

  // Basic processing limits
  processing: {
    timeoutMs: 30000, // 30 seconds
    maxRetries: 1,
  },
};

// Export file paths
export const EXPORT_PATHS = {
  storage: EXPORT_CONFIG.storage.directory,
  temp: path.join(EXPORT_CONFIG.storage.directory, 'temp'),
};

// Basic export constants
export const EXPORT_CONSTANTS = {
  SUPPORTED_FORMATS: ['pdf', 'excel'] as const,
  MAX_QUOTE_ITEMS: 500,
  FILENAME_MAX_LENGTH: 100,
  
  // Simple error codes
  ERROR_CODES: {
    VALIDATION_FAILED: 'EXPORT_001',
    PROCESSING_FAILED: 'EXPORT_002',
    FILE_NOT_FOUND: 'EXPORT_003',
    TIMEOUT_ERROR: 'EXPORT_004',
  } as const,
} as const;