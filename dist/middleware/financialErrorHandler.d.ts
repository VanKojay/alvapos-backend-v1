import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../types/api';
export interface FinancialError extends Error {
    type: 'CALCULATION_ERROR' | 'VALIDATION_ERROR' | 'PRECISION_ERROR' | 'SYNC_ERROR' | 'TIMEOUT_ERROR';
    details?: any;
    recoverable?: boolean;
    context?: {
        operation?: string;
        data?: any;
        sessionId?: string;
        timestamp?: string;
    };
}
export declare class FinancialErrorHandler {
    private static instance;
    private errorCounts;
    private recentErrors;
    private readonly MAX_RECENT_ERRORS;
    private readonly ERROR_RESET_INTERVAL;
    constructor();
    static getInstance(): FinancialErrorHandler;
    private setupErrorTracking;
    private cleanupErrorTracking;
    private trackError;
    createFinancialError(type: FinancialError['type'], message: string, details?: any, context?: FinancialError['context']): FinancialError;
    private isRecoverableError;
    handleDecimalError(error: any, context?: FinancialError['context']): FinancialError;
    handleValidationErrors(errors: ValidationError[], operation: string, context?: FinancialError['context']): FinancialError;
    handleSyncError(error: any, sessionId: string, operation: string): FinancialError;
    middleware(): (error: any, req: Request, res: Response, next: NextFunction) => void;
    private handleFinancialError;
    private isFinancialError;
    private isDecimalError;
    private isFinancialValidationError;
    private getLogLevel;
    private getStatusCode;
    private getPublicErrorMessage;
    private getRecoverySuggestions;
    getErrorStats(): {
        errorCounts: Record<string, number>;
        recentErrorCount: number;
        errorTypes: Record<string, number>;
    };
    isHighErrorRate(): boolean;
    getSystemHealth(): {
        status: 'healthy' | 'warning' | 'critical';
        errorRate: number;
        details: string;
    };
}
export declare const financialErrorHandler: FinancialErrorHandler;
export declare const financialErrorMiddleware: (error: any, req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=financialErrorHandler.d.ts.map