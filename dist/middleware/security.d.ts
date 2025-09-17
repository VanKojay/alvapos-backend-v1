import { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import Joi from 'joi';
export declare const corsMiddleware: (req: cors.CorsRequest, res: {
    statusCode?: number | undefined;
    setHeader(key: string, value: string): any;
    end(): any;
}, next: (err?: any) => any) => void;
export declare const helmetMiddleware: (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
export declare const basicRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare function advancedRateLimiter(): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function sanitizeInput(): (req: Request, res: Response, next: NextFunction) => void;
export declare function validateRequest(schema: {
    body?: Joi.Schema;
    query?: Joi.Schema;
    params?: Joi.Schema;
    headers?: Joi.Schema;
}): (req: Request, res: Response, next: NextFunction) => void;
export declare function requestIdMiddleware(): (req: Request, res: Response, next: NextFunction) => void;
export declare function securityHeaders(): (req: Request, res: Response, next: NextFunction) => void;
export declare function validateFileUpload(): (req: Request, res: Response, next: NextFunction) => void | Response;
//# sourceMappingURL=security.d.ts.map