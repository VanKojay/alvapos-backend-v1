// ALVA POS MVP - Export Logging Service
// Simplified logging for export operations

import fs from 'fs';
import path from 'path';

interface LogContext {
  jobId?: string;
  userId?: string;
  sessionId?: string;
  operation?: string;
  stage?: string;
  [key: string]: any;
}

export class ExportLoggerService {
  private static instance: ExportLoggerService;
  private logDir: string;

  private constructor() {
    this.logDir = path.join(process.cwd(), 'logs', 'exports');
    this.ensureLogDirectory();
  }

  static getInstance(): ExportLoggerService {
    if (!ExportLoggerService.instance) {
      ExportLoggerService.instance = new ExportLoggerService();
    }
    return ExportLoggerService.instance;
  }

  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('INFO', message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = error ? { ...context, error: error.message, stack: error.stack } : context;
    this.log('ERROR', message, errorContext);
  }

  warn(message: string, context?: LogContext): void {
    this.log('WARN', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log('DEBUG', message, context);
  }

  private log(level: string, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context
    };

    // Console output
    console.log(`[${timestamp}] ${level}: ${message}`, context ? JSON.stringify(context) : '');

    // File output (optional, non-blocking)
    try {
      const logFile = path.join(this.logDir, `exports-${new Date().toISOString().split('T')[0]}.log`);
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      // Fail silently for logging errors
    }
  }

  // Performance tracking methods
  createTimer(): () => void {
    const startTime = Date.now();
    return () => {
      return Date.now() - startTime;
    };
  }

  logPerformance(operation: string, duration: number, context?: LogContext): void {
    this.info(`Performance: ${operation} took ${duration}ms`, context);
  }

  // Security logging
  logSecurityEvent(event: string, context?: LogContext): void {
    this.warn(`Security: ${event}`, { ...context, security: true });
  }

  // Export-specific logging
  logExportStart(jobId: string, format: string, userId?: string): void {
    this.info('Export started', { jobId, format, userId, stage: 'start' });
  }

  logExportComplete(jobId: string, format: string, fileSize: number, duration: number): void {
    this.info('Export completed', { jobId, format, fileSize, duration, stage: 'complete' });
  }

  logExportError(jobId: string, format: string, error: Error): void {
    this.error('Export failed', error, { jobId, format, stage: 'error' });
  }

  // Missing methods used by other services
  logSecurityViolation(message: string, context?: LogContext): void {
    this.warn(`Security Violation: ${message}`, { ...context, security: true });
  }

  logRateLimitExceeded(message: string, context?: LogContext): void {
    this.warn(`Rate Limit: ${message}`, { ...context, rateLimited: true });
  }

  logFileDownload(fileId: string, context?: LogContext): void {
    this.info(`File downloaded: ${fileId}`, context);
  }

  logJobStarted(jobId: string, context?: LogContext): void {
    this.info(`Job started: ${jobId}`, context);
  }

  logJobProgress(jobId: string, progress: number, context?: LogContext): void {
    this.info(`Job progress: ${jobId} - ${progress}%`, context);
  }

  logJobCompleted(jobId: string, context?: LogContext): void {
    this.info(`Job completed: ${jobId}`, context);
  }

  logJobFailed(jobId: string, error: string, context?: LogContext): void {
    this.error(`Job failed: ${jobId}`, undefined, { ...context, error });
  }

  logJobCreated(jobId: string, context?: LogContext): void {
    this.info(`Job created: ${jobId}`, context);
  }

  startPerformanceTimer(): () => number {
    const startTime = Date.now();
    return () => Date.now() - startTime;
  }
}

export default ExportLoggerService;