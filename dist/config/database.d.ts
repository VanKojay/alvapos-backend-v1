import { Pool } from 'pg';
export interface DatabaseConnection {
    pool: Pool;
    testConnection(): Promise<boolean>;
    getHealthStatus(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: any;
    }>;
    cleanup(): Promise<void>;
}
declare class PostgreSQLConnection implements DatabaseConnection {
    pool: Pool;
    private healthCheckInterval;
    constructor();
    testConnection(): Promise<boolean>;
    getHealthStatus(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: any;
    }>;
    executeQuery<T = any>(queryText: string, values?: any[], context?: string): Promise<{
        data: T[] | null;
        error: any;
    }>;
    executeTransaction<T = any>(queries: Array<{
        text: string;
        values?: any[];
    }>, context?: string): Promise<{
        data: T[] | null;
        error: any;
    }>;
    sessionQuery<T = any>(sessionId: string, queryText: string, values?: any[], context?: string): Promise<{
        data: T[] | null;
        error: any;
    }>;
    private startHealthCheck;
    cleanup(): Promise<void>;
}
export declare const database: PostgreSQLConnection;
export declare const db: {
    query: <T = any>(sessionId: string, queryText: string, values?: any[], context?: string) => Promise<{
        data: T[];
        error: any;
    }>;
    execute: <T = any>(queryText: string, values?: any[], context?: string) => Promise<{
        data: T[];
        error: any;
    }>;
    transaction: <T = any>(queries: Array<{
        text: string;
        values?: any[];
    }>, context?: string) => Promise<{
        data: T[];
        error: any;
    }>;
    health: () => Promise<{
        status: "healthy" | "unhealthy";
        details: any;
    }>;
    test: () => Promise<boolean>;
    pool: Pool;
};
export {};
//# sourceMappingURL=database.d.ts.map