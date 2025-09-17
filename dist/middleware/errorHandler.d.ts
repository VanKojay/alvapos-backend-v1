import { Request, Response, NextFunction } from 'express';
export interface APIError extends Error {
    statusCode?: number;
    code?: string;
    details?: any;
    isOperational?: boolean;
}
export declare class AppError extends Error implements APIError {
    statusCode: number;
    code: string;
    isOperational: boolean;
    details?: any;
    constructor(message: string, statusCode?: number, code?: string, isOperational?: boolean, details?: any);
}
export declare class ValidationError extends AppError {
    constructor(message: string, details?: any);
}
export declare class NotFoundError extends AppError {
    constructor(resource?: string);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
export declare class ConflictError extends AppError {
    constructor(message?: string);
}
export declare class RateLimitError extends AppError {
    constructor(message?: string);
}
export declare class DatabaseError extends AppError {
    constructor(message?: string, details?: any);
}
export declare class ExternalServiceError extends AppError {
    constructor(service: string, message?: string);
}
export declare function errorHandler(error: APIError, req: Request, res: Response, next: NextFunction): void;
export declare function notFoundHandler(req: Request, res: Response, next: NextFunction): void;
export declare function handleUncaughtException(error: Error): void;
export declare function handleUnhandledRejection(reason: any, promise: Promise<any>): void;
export declare function asyncHandler<T extends Request, U extends Response>(fn: (req: T, res: U, next: NextFunction) => Promise<any>): (req: T, res: U, next: NextFunction) => void;
export declare function handleValidationError(error: any): ValidationError;
//# sourceMappingURL=errorHandler.d.ts.map