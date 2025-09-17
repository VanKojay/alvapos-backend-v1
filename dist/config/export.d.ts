export declare const EXPORT_CONFIG: {
    storage: {
        directory: string;
        maxFileSize: number;
        cleanup: {
            enabled: boolean;
            retentionHours: number;
        };
    };
    security: {
        allowedFormats: readonly ["pdf", "excel"];
        requireAuth: boolean;
        maxDownloads: number;
    };
    processing: {
        timeoutMs: number;
        maxRetries: number;
    };
};
export declare const EXPORT_PATHS: {
    storage: string;
    temp: string;
};
export declare const EXPORT_CONSTANTS: {
    readonly SUPPORTED_FORMATS: readonly ["pdf", "excel"];
    readonly MAX_QUOTE_ITEMS: 500;
    readonly FILENAME_MAX_LENGTH: 100;
    readonly ERROR_CODES: {
        readonly VALIDATION_FAILED: "EXPORT_001";
        readonly PROCESSING_FAILED: "EXPORT_002";
        readonly FILE_NOT_FOUND: "EXPORT_003";
        readonly TIMEOUT_ERROR: "EXPORT_004";
    };
};
//# sourceMappingURL=export.d.ts.map