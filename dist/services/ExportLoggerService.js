"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportLoggerService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class ExportLoggerService {
    constructor() {
        this.logDir = path_1.default.join(process.cwd(), 'logs', 'exports');
        this.ensureLogDirectory();
    }
    static getInstance() {
        if (!ExportLoggerService.instance) {
            ExportLoggerService.instance = new ExportLoggerService();
        }
        return ExportLoggerService.instance;
    }
    ensureLogDirectory() {
        try {
            if (!fs_1.default.existsSync(this.logDir)) {
                fs_1.default.mkdirSync(this.logDir, { recursive: true });
            }
        }
        catch (error) {
            console.error('Failed to create log directory:', error);
        }
    }
    info(message, context) {
        this.log('INFO', message, context);
    }
    error(message, error, context) {
        const errorContext = error ? { ...context, error: error.message, stack: error.stack } : context;
        this.log('ERROR', message, errorContext);
    }
    warn(message, context) {
        this.log('WARN', message, context);
    }
    debug(message, context) {
        this.log('DEBUG', message, context);
    }
    log(level, message, context) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...context
        };
        console.log(`[${timestamp}] ${level}: ${message}`, context ? JSON.stringify(context) : '');
        try {
            const logFile = path_1.default.join(this.logDir, `exports-${new Date().toISOString().split('T')[0]}.log`);
            const logLine = JSON.stringify(logEntry) + '\n';
            fs_1.default.appendFileSync(logFile, logLine);
        }
        catch (error) {
        }
    }
    createTimer() {
        const startTime = Date.now();
        return () => {
            return Date.now() - startTime;
        };
    }
    logPerformance(operation, duration, context) {
        this.info(`Performance: ${operation} took ${duration}ms`, context);
    }
    logSecurityEvent(event, context) {
        this.warn(`Security: ${event}`, { ...context, security: true });
    }
    logExportStart(jobId, format, userId) {
        this.info('Export started', { jobId, format, userId, stage: 'start' });
    }
    logExportComplete(jobId, format, fileSize, duration) {
        this.info('Export completed', { jobId, format, fileSize, duration, stage: 'complete' });
    }
    logExportError(jobId, format, error) {
        this.error('Export failed', error, { jobId, format, stage: 'error' });
    }
    logSecurityViolation(message, context) {
        this.warn(`Security Violation: ${message}`, { ...context, security: true });
    }
    logRateLimitExceeded(message, context) {
        this.warn(`Rate Limit: ${message}`, { ...context, rateLimited: true });
    }
    logFileDownload(fileId, context) {
        this.info(`File downloaded: ${fileId}`, context);
    }
    logJobStarted(jobId, context) {
        this.info(`Job started: ${jobId}`, context);
    }
    logJobProgress(jobId, progress, context) {
        this.info(`Job progress: ${jobId} - ${progress}%`, context);
    }
    logJobCompleted(jobId, context) {
        this.info(`Job completed: ${jobId}`, context);
    }
    logJobFailed(jobId, error, context) {
        this.error(`Job failed: ${jobId}`, undefined, { ...context, error });
    }
    logJobCreated(jobId, context) {
        this.info(`Job created: ${jobId}`, context);
    }
    startPerformanceTimer() {
        const startTime = Date.now();
        return () => Date.now() - startTime;
    }
}
exports.ExportLoggerService = ExportLoggerService;
exports.default = ExportLoggerService;
//# sourceMappingURL=ExportLoggerService.js.map