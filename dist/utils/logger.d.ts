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
export declare class Logger {
    private static formatMessage;
    static error(message: string, context?: LogContext | unknown): void;
    static warn(message: string, context?: LogContext): void;
    static info(message: string, context?: LogContext): void;
    static debug(message: string, context?: LogContext): void;
    static request(method: string, url: string, statusCode: number, responseTime: number, context?: LogContext): void;
    static security(message: string, context?: LogContext): void;
    static performance(message: string, context?: LogContext): void;
    static database(message: string, context?: LogContext): void;
    static session(message: string, context?: LogContext): void;
}
//# sourceMappingURL=logger.d.ts.map