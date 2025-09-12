// ALVA POS MVP - Simple Export Types
// Minimal type definitions for MVP export functionality

export interface ExportRequest {
  quoteId: string;
  format: 'pdf' | 'excel';
  options?: ExportOptions;
}

export interface ExportOptions {
  includeLogo?: boolean;
}

export interface ExportFile {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}

// Simple error type
export class ExportError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

// Simple response types
export interface ExportResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface HealthCheckResponse {
  healthy: boolean;
  timestamp: string;
  message: string;
}