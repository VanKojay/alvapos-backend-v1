interface LogContext {
    jobId?: string;
    userId?: string;
    sessionId?: string;
    operation?: string;
    stage?: string;
    [key: string]: any;
}
export declare class ExportLoggerService {
    private static instance;
    private logDir;
    private constructor();
    static getInstance(): ExportLoggerService;
    private ensureLogDirectory;
    info(message: string, context?: LogContext): void;
    error(message: string, error?: Error, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    debug(message: string, context?: LogContext): void;
    private log;
    createTimer(): () => void;
    logPerformance(operation: string, duration: number, context?: LogContext): void;
    logSecurityEvent(event: string, context?: LogContext): void;
    logExportStart(jobId: string, format: string, userId?: string): void;
    logExportComplete(jobId: string, format: string, fileSize: number, duration: number): void;
    logExportError(jobId: string, format: string, error: Error): void;
    logSecurityViolation(message: string, context?: LogContext): void;
    logRateLimitExceeded(message: string, context?: LogContext): void;
    logFileDownload(fileId: string, context?: LogContext): void;
    logJobStarted(jobId: string, context?: LogContext): void;
    logJobProgress(jobId: string, progress: number, context?: LogContext): void;
    logJobCompleted(jobId: string, context?: LogContext): void;
    logJobFailed(jobId: string, error: string, context?: LogContext): void;
    logJobCreated(jobId: string, context?: LogContext): void;
    startPerformanceTimer(): () => number;
}
export default ExportLoggerService;
//# sourceMappingURL=ExportLoggerService.d.ts.map