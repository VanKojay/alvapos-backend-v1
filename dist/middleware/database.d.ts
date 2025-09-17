import { Request } from 'express';
import mysql from 'mysql2/promise';
export interface DatabaseRequest extends Request {
    db?: {
        getProducts: (category?: string, search?: string, inStockOnly?: boolean, limit?: number, offset?: number) => Promise<{
            data: any[] | null;
            error?: Error;
        }>;
        searchProducts: (query: string, filters: any, sortBy: string, limit: number, offset: number) => Promise<{
            data: any[] | null;
            error?: Error;
        }>;
        getProduct: (id: string) => Promise<{
            data: any | null;
            error?: Error;
        }>;
        logSearchQuery?: (query: string, type: string, count: number, responseTime: number) => Promise<void>;
    };
}
export declare let poolAlvamitra: mysql.Pool;
export declare let poolSmartjmp: mysql.Pool;
export declare function initMySQLPool(): Promise<void>;
export declare function mysqlMiddleware(): void;
//# sourceMappingURL=database.d.ts.map