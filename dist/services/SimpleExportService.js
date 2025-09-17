"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simpleExportService = exports.SimpleExportService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class SimpleExportService {
    constructor() {
        this.exportsDir = path_1.default.join(process.cwd(), 'exports');
        this.ensureExportsDirectory();
    }
    static getInstance() {
        if (!SimpleExportService.instance) {
            SimpleExportService.instance = new SimpleExportService();
        }
        return SimpleExportService.instance;
    }
    ensureExportsDirectory() {
        try {
            if (!fs_1.default.existsSync(this.exportsDir)) {
                fs_1.default.mkdirSync(this.exportsDir, { recursive: true });
            }
        }
        catch (error) {
            console.warn('Could not create exports directory:', error);
        }
    }
    async saveExportFile(options) {
        try {
            const filePath = path_1.default.join(this.exportsDir, options.filename);
            if (options.format === 'excel') {
                if (Buffer.isBuffer(options.data)) {
                    fs_1.default.writeFileSync(filePath, options.data);
                }
                else {
                    throw new Error('Excel data must be a buffer');
                }
            }
            else {
                const content = typeof options.data === 'string'
                    ? options.data
                    : JSON.stringify(options.data, null, 2);
                fs_1.default.writeFileSync(filePath, content);
            }
            console.log(`Export file saved: ${filePath}`);
            return filePath;
        }
        catch (error) {
            console.error('Error saving export file:', error);
            throw error;
        }
    }
    async getExportFile(filename) {
        const filePath = path_1.default.join(this.exportsDir, filename);
        const exists = fs_1.default.existsSync(filePath);
        return { filePath, exists };
    }
    async cleanupOldFiles(maxAgeHours = 24) {
        try {
            const files = fs_1.default.readdirSync(this.exportsDir);
            const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
            for (const file of files) {
                const filePath = path_1.default.join(this.exportsDir, file);
                const stats = fs_1.default.statSync(filePath);
                if (stats.mtime.getTime() < cutoffTime) {
                    fs_1.default.unlinkSync(filePath);
                    console.log(`Cleaned up old export file: ${file}`);
                }
            }
        }
        catch (error) {
            console.warn('Error during export cleanup:', error);
        }
    }
    getHealthStatus() {
        return {
            healthy: fs_1.default.existsSync(this.exportsDir),
            exportsDir: this.exportsDir,
            writable: this.checkWriteAccess()
        };
    }
    checkWriteAccess() {
        try {
            const testFile = path_1.default.join(this.exportsDir, '.write-test');
            fs_1.default.writeFileSync(testFile, 'test');
            fs_1.default.unlinkSync(testFile);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.SimpleExportService = SimpleExportService;
exports.simpleExportService = SimpleExportService.getInstance();
//# sourceMappingURL=SimpleExportService.js.map