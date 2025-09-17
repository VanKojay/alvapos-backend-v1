export interface ExportRequest {
    quoteId: string;
    format: 'pdf' | 'excel';
    options?: ExportOptions;
}
export interface ExportOptions {
    includeLogo?: boolean;
}
export interface ExportFile {
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    filePath: string;
    createdAt: Date;
    expiresAt: Date;
}
export interface ValidationResult {
    isValid: boolean;
    errors?: string[];
}
export declare class ExportError extends Error {
    code: string;
    constructor(code: string, message: string);
}
export interface ExportResponse {
    success: boolean;
    message: string;
    data?: any;
}
export interface HealthCheckResponse {
    healthy: boolean;
    timestamp: string;
    message: string;
}
//# sourceMappingURL=export.d.ts.map