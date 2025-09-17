"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const environment_1 = require("../config/environment");
class Logger {
    static formatMessage(level, message, context) {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
    }
    static error(message, context) {
        let logContext;
        if (context) {
            if (typeof context === 'object' && context !== null && 'message' in context) {
                const error = context;
                logContext = {
                    error: error.message,
                    stack: error.stack,
                    name: error.name
                };
            }
            else if (typeof context === 'object') {
                logContext = context;
            }
            else {
                logContext = { error: String(context) };
            }
        }
        console.error(this.formatMessage('error', message, logContext));
    }
    static warn(message, context) {
        if (['warn', 'info', 'debug'].includes(environment_1.config.logging.level)) {
            console.warn(this.formatMessage('warn', message, context));
        }
    }
    static info(message, context) {
        if (['info', 'debug'].includes(environment_1.config.logging.level)) {
            console.info(this.formatMessage('info', message, context));
        }
    }
    static debug(message, context) {
        if (environment_1.config.logging.level === 'debug') {
            console.debug(this.formatMessage('debug', message, context));
        }
    }
    static request(method, url, statusCode, responseTime, context) {
        const message = `${method} ${url} - ${statusCode} - ${responseTime}ms`;
        const logContext = { method, url, statusCode, responseTime, ...context };
        if (statusCode >= 500) {
            this.error(message, logContext);
        }
        else if (statusCode >= 400) {
            this.warn(message, logContext);
        }
        else {
            this.info(message, logContext);
        }
    }
    static security(message, context) {
        this.warn(`SECURITY: ${message}`, context);
    }
    static performance(message, context) {
        this.info(`PERFORMANCE: ${message}`, context);
    }
    static database(message, context) {
        this.debug(`DATABASE: ${message}`, context);
    }
    static session(message, context) {
        this.debug(`SESSION: ${message}`, context);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map