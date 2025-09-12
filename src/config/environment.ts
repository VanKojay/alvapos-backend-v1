import Joi from 'joi';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  PORT: Joi.number().default(5000),
  
  // PostgreSQL Configuration
  DATABASE_URL: Joi.string().uri().required(),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().default('alva_pos'),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  
  // Database Configuration
  DB_CONNECTION_POOL_MIN: Joi.number().default(2),
  DB_CONNECTION_POOL_MAX: Joi.number().default(10),
  DB_IDLE_TIMEOUT: Joi.number().default(30000),
  DB_ACQUIRE_TIMEOUT: Joi.number().default(30000),
  
  // Session Configuration
  SESSION_SECRET: Joi.string().min(32).required(),
  SESSION_TIMEOUT: Joi.number().default(86400000), // 24 hours
  SESSION_CLEANUP_INTERVAL: Joi.number().default(3600000), // 1 hour
  
  // Security Configuration
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000,http://localhost:5173,http://localhost:4173'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  RATE_LIMIT_SKIP_SUCCESS: Joi.boolean().default(true),
  
  // File Upload Configuration
  MAX_FILE_SIZE: Joi.number().default(10485760), // 10MB
  ALLOWED_FILE_TYPES: Joi.string().default('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json'),
  
  // Logging Configuration
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('combined', 'common', 'dev', 'short', 'tiny').default('combined'),
  
  // Performance Configuration
  COMPRESSION_THRESHOLD: Joi.number().default(1024),
  KEEP_ALIVE_TIMEOUT: Joi.number().default(65000),
  HEADERS_TIMEOUT: Joi.number().default(66000),
}).unknown();

// Validate environment variables
const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

export const config = {
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
    allowedOrigins: envVars.ALLOWED_ORIGINS.split(',').map((origin: string) => origin.trim()),
  },
  
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
    skipSuccessfulRequests: envVars.RATE_LIMIT_SKIP_SUCCESS,
  },
  
  fileUpload: {
    maxSize: envVars.MAX_FILE_SIZE,
    allowedTypes: envVars.ALLOWED_FILE_TYPES.split(',').map((type: string) => type.trim()),
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
} as const;

export type Config = typeof config;