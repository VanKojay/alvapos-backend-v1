export declare const config: {
    readonly env: any;
    readonly port: any;
    readonly isDevelopment: boolean;
    readonly isProduction: boolean;
    readonly isTest: boolean;
    readonly database: {
        readonly url: any;
        readonly host: any;
        readonly port: any;
        readonly name: any;
        readonly user: any;
        readonly password: any;
        readonly connectionPool: {
            readonly min: any;
            readonly max: any;
            readonly idleTimeout: any;
            readonly acquireTimeout: any;
        };
    };
    readonly session: {
        readonly secret: any;
        readonly timeout: any;
        readonly cleanupInterval: any;
    };
    readonly cors: {
        readonly origin: any;
        readonly allowedOrigins: any;
    };
    readonly rateLimit: {
        readonly windowMs: any;
        readonly maxRequests: any;
        readonly skipSuccessfulRequests: any;
    };
    readonly fileUpload: {
        readonly maxSize: any;
        readonly allowedTypes: any;
    };
    readonly logging: {
        readonly level: any;
        readonly format: any;
    };
    readonly performance: {
        readonly compressionThreshold: any;
        readonly keepAliveTimeout: any;
        readonly headersTimeout: any;
    };
};
export type Config = typeof config;
//# sourceMappingURL=environment.d.ts.map