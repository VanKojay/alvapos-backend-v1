"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const joi_1 = __importDefault(require("joi"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const envSchema = joi_1.default.object({
    NODE_ENV: joi_1.default.string().valid('development', 'test', 'staging', 'production').default('development'),
    PORT: joi_1.default.number().default(5000),
    DATABASE_URL: joi_1.default.string().uri().required(),
    DB_HOST: joi_1.default.string().default('localhost'),
    DB_PORT: joi_1.default.number().default(5432),
    DB_NAME: joi_1.default.string().default('alva_pos'),
    DB_USER: joi_1.default.string().required(),
    DB_PASSWORD: joi_1.default.string().required(),
    DB_CONNECTION_POOL_MIN: joi_1.default.number().default(2),
    DB_CONNECTION_POOL_MAX: joi_1.default.number().default(10),
    DB_IDLE_TIMEOUT: joi_1.default.number().default(30000),
    DB_ACQUIRE_TIMEOUT: joi_1.default.number().default(30000),
    SESSION_SECRET: joi_1.default.string().min(32).required(),
    SESSION_TIMEOUT: joi_1.default.number().default(86400000),
    SESSION_CLEANUP_INTERVAL: joi_1.default.number().default(3600000),
    CORS_ORIGIN: joi_1.default.string().default('http://localhost:5173'),
    ALLOWED_ORIGINS: joi_1.default.string().default('http://localhost:3000,http://localhost:5173,http://localhost:4173'),
    RATE_LIMIT_WINDOW_MS: joi_1.default.number().default(900000),
    RATE_LIMIT_MAX_REQUESTS: joi_1.default.number().default(100),
    RATE_LIMIT_SKIP_SUCCESS: joi_1.default.boolean().default(true),
    MAX_FILE_SIZE: joi_1.default.number().default(10485760),
    ALLOWED_FILE_TYPES: joi_1.default.string().default('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json'),
    LOG_LEVEL: joi_1.default.string().valid('error', 'warn', 'info', 'debug').default('info'),
    LOG_FORMAT: joi_1.default.string().valid('combined', 'common', 'dev', 'short', 'tiny').default('combined'),
    COMPRESSION_THRESHOLD: joi_1.default.number().default(1024),
    KEEP_ALIVE_TIMEOUT: joi_1.default.number().default(65000),
    HEADERS_TIMEOUT: joi_1.default.number().default(66000),
}).unknown();
const { error, value: envVars } = envSchema.validate(process.env);
if (error) {
    throw new Error(`Environment validation error: ${error.message}`);
}
exports.config = {
    env: envVars.NODE_ENV,
    port: envVars.PORT,
    isDevelopment: envVars.NODE_ENV === 'development',
    isProduction: envVars.NODE_ENV === 'production',
    isTest: envVars.NODE_ENV === 'test',
    database: {
        url: envVars.DATABASE_URL,
        host: envVars.DB_HOST,
        port: envVars.DB_PORT,
        name: envVars.DB_NAME,
        user: envVars.DB_USER,
        password: envVars.DB_PASSWORD,
        connectionPool: {
            min: envVars.DB_CONNECTION_POOL_MIN,
            max: envVars.DB_CONNECTION_POOL_MAX,
            idleTimeout: envVars.DB_IDLE_TIMEOUT,
            acquireTimeout: envVars.DB_ACQUIRE_TIMEOUT,
        },
    },
    session: {
        secret: envVars.SESSION_SECRET,
        timeout: envVars.SESSION_TIMEOUT,
        cleanupInterval: envVars.SESSION_CLEANUP_INTERVAL,
    },
    cors: {
        origin: envVars.CORS_ORIGIN,
        allowedOrigins: envVars.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
    },
    rateLimit: {
        windowMs: envVars.RATE_LIMIT_WINDOW_MS,
        maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
        skipSuccessfulRequests: envVars.RATE_LIMIT_SKIP_SUCCESS,
    },
    fileUpload: {
        maxSize: envVars.MAX_FILE_SIZE,
        allowedTypes: envVars.ALLOWED_FILE_TYPES.split(',').map((type) => type.trim()),
    },
    logging: {
        level: envVars.LOG_LEVEL,
        format: envVars.LOG_FORMAT,
    },
    performance: {
        compressionThreshold: envVars.COMPRESSION_THRESHOLD,
        keepAliveTimeout: envVars.KEEP_ALIVE_TIMEOUT,
        headersTimeout: envVars.HEADERS_TIMEOUT,
    },
};
//# sourceMappingURL=environment.js.map