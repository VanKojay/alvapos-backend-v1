import { Request, Response, NextFunction } from 'express';
declare function basicRateLimit(): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
declare function sanitizeInput(): (req: Request, res: Response, next: NextFunction) => void;
declare function securityHeaders(): (req: Request, res: Response, next: NextFunction) => void;
export { securityHeaders, sanitizeInput, basicRateLimit };
//# sourceMappingURL=exportSecurity.d.ts.map