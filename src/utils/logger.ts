import { config } from '@/config/environment';

export interface LogContext {
  requestId?: string;
  sessionId?: string;
  userId?: string;
  method?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: any;
}

export class Logger {
  private static formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  static error(message: string, context?: LogContext | unknown): void {
    // Handle unknown error types by converting them to LogContext
    let logContext: LogContext | undefined;
    
    if (context) {
      if (typeof context === 'object' && context !== null && 'message' in context) {
        // It's likely an Error object
        const error = context as Error;
        logContext = { 
          error: error.message,
          stack: error.stack,
          name: error.name
        };
      } else if (typeof context === 'object') {
        // Try to use it as LogContext
        logContext = context as LogContext;
      } else {
        // Convert primitive types to LogContext
        logContext = { error: String(context) };
      }
    }
    
    console.error(this.formatMessage('error', message, logContext));
  }

  static warn(message: string, context?: LogContext): void {
    if (['warn', 'info', 'debug'].includes(config.logging.level)) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  static info(message: string, context?: LogContext): void {
    if (['info', 'debug'].includes(config.logging.level)) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  static debug(message: string, context?: LogContext): void {
    if (config.logging.level === 'debug') {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  static request(method: string, url: string, statusCode: number, responseTime: number, context?: LogContext): void {
    const message = `${method} ${url} - ${statusCode} - ${responseTime}ms`;
    const logContext = { method, url, statusCode, responseTime, ...context };
    
    if (statusCode >= 500) {
      this.error(message, logContext);
    } else if (statusCode >= 400) {
      this.warn(message, logContext);
    } else {
      this.info(message, logContext);
    }
  }

  static security(message: string, context?: LogContext): void {
    this.warn(`SECURITY: ${message}`, context);
  }

  static performance(message: string, context?: LogContext): void {
    this.info(`PERFORMANCE: ${message}`, context);
  }

  static database(message: string, context?: LogContext): void {
    this.debug(`DATABASE: ${message}`, context);
  }

  static session(message: string, context?: LogContext): void {
    this.debug(`SESSION: ${message}`, context);
  }
}