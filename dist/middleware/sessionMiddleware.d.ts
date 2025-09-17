import { Request, Response, NextFunction } from 'express';
import { SessionData } from '../utils/session';
declare global {
    namespace Express {
        interface Request {
            sessionId: string;
            session: SessionData;
        }
    }
}
export interface SessionMiddlewareOptions {
    required?: boolean;
    createIfMissing?: boolean;
    cookieName?: string;
    headerName?: string;
}
export declare function sessionMiddleware(options?: SessionMiddlewareOptions): (req: Request, res: Response, next: NextFunction) => void;
export declare function validateSessionMiddleware(): (req: Request, res: Response, next: NextFunction) => void;
export declare function setSessionData(key: string, value: any): (req: Request, res: Response, next: NextFunction) => void;
export declare const optionalSessionMiddleware: (req: Request, res: Response, next: NextFunction) => void;
export declare const requiredSessionMiddleware: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=sessionMiddleware.d.ts.map