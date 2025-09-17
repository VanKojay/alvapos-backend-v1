"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPORT_CONSTANTS = exports.EXPORT_PATHS = exports.EXPORT_CONFIG = void 0;
const path_1 = __importDefault(require("path"));
exports.EXPORT_CONFIG = {
    storage: {
        directory: path_1.default.join(process.cwd(), 'exports'),
        maxFileSize: 10 * 1024 * 1024,
        cleanup: {
            enabled: true,
            retentionHours: 24,
        },
    },
    security: {
        allowedFormats: ['pdf', 'excel'],
        requireAuth: false,
        maxDownloads: 10,
    },
    processing: {
        timeoutMs: 30000,
        maxRetries: 1,
    },
};
exports.EXPORT_PATHS = {
    storage: exports.EXPORT_CONFIG.storage.directory,
    temp: path_1.default.join(exports.EXPORT_CONFIG.storage.directory, 'temp'),
};
exports.EXPORT_CONSTANTS = {
    SUPPORTED_FORMATS: ['pdf', 'excel'],
    MAX_QUOTE_ITEMS: 500,
    FILENAME_MAX_LENGTH: 100,
    ERROR_CODES: {
        VALIDATION_FAILED: 'EXPORT_001',
        PROCESSING_FAILED: 'EXPORT_002',
        FILE_NOT_FOUND: 'EXPORT_003',
        TIMEOUT_ERROR: 'EXPORT_004',
    },
};
//# sourceMappingURL=export.js.map