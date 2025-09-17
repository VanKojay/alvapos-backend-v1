interface ExportOptions {
    format: 'pdf' | 'excel';
    filename: string;
    data: any;
}
export declare class SimpleExportService {
    private static instance;
    private exportsDir;
    private constructor();
    static getInstance(): SimpleExportService;
    private ensureExportsDirectory;
    saveExportFile(options: ExportOptions): Promise<string>;
    getExportFile(filename: string): Promise<{
        filePath: string;
        exists: boolean;
    }>;
    cleanupOldFiles(maxAgeHours?: number): Promise<void>;
    getHealthStatus(): {
        healthy: boolean;
        exportsDir: string;
        writable: boolean;
    };
    private checkWriteAccess;
}
export declare const simpleExportService: SimpleExportService;
export {};
//# sourceMappingURL=SimpleExportService.d.ts.map