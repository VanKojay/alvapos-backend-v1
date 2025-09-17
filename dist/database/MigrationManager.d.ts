export interface Migration {
    version: string;
    name: string;
    sql: string;
    checksum?: string;
    appliedAt?: string;
    executionTimeMs?: number;
}
export interface MigrationResult {
    success: boolean;
    version: string;
    name: string;
    executionTimeMs: number;
    error?: string;
}
export declare class MigrationManager {
    private migrationsPath;
    constructor();
    private initializeMigrationTracking;
    getAppliedMigrations(): Promise<Migration[]>;
    getAvailableMigrations(): Migration[];
    getPendingMigrations(): Promise<Migration[]>;
    runMigration(migration: Migration): Promise<MigrationResult>;
    runPendingMigrations(): Promise<MigrationResult[]>;
    rollbackMigration(version: string): Promise<MigrationResult>;
    getMigrationStatus(): Promise<{
        applied: Migration[];
        pending: Migration[];
        total: number;
        upToDate: boolean;
    }>;
    private generateChecksum;
}
export declare const migrationManager: MigrationManager;
//# sourceMappingURL=MigrationManager.d.ts.map