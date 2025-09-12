// ALVA POS MVP - Simple Export Service
// Basic file operations for export functionality

import fs from 'fs';
import path from 'path';

interface ExportOptions {
  format: 'pdf' | 'excel';
  filename: string;
  data: any;
}

export class SimpleExportService {
  private static instance: SimpleExportService;
  private exportsDir: string;

  private constructor() {
    this.exportsDir = path.join(process.cwd(), 'exports');
    this.ensureExportsDirectory();
  }

  static getInstance(): SimpleExportService {
    if (!SimpleExportService.instance) {
      SimpleExportService.instance = new SimpleExportService();
    }
    return SimpleExportService.instance;
  }

  private ensureExportsDirectory(): void {
    try {
      if (!fs.existsSync(this.exportsDir)) {
        fs.mkdirSync(this.exportsDir, { recursive: true });
      }
    } catch (error) {
      console.warn('Could not create exports directory:', error);
    }
  }

  /**
   * Save export data to a file (for server-side generation fallback)
   */
  async saveExportFile(options: ExportOptions): Promise<string> {
    try {
      const filePath = path.join(this.exportsDir, options.filename);
      
      if (options.format === 'excel') {
        // For Excel files, data should already be a buffer from exceljs
        if (Buffer.isBuffer(options.data)) {
          fs.writeFileSync(filePath, options.data);
        } else {
          throw new Error('Excel data must be a buffer');
        }
      } else {
        // For other formats, write as JSON or string
        const content = typeof options.data === 'string' 
          ? options.data 
          : JSON.stringify(options.data, null, 2);
        fs.writeFileSync(filePath, content);
      }

      console.log(`Export file saved: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Error saving export file:', error);
      throw error;
    }
  }

  /**
   * Serve a file for download
   */
  async getExportFile(filename: string): Promise<{ filePath: string; exists: boolean }> {
    const filePath = path.join(this.exportsDir, filename);
    const exists = fs.existsSync(filePath);
    
    return { filePath, exists };
  }

  /**
   * Clean up old export files (basic cleanup)
   */
  async cleanupOldFiles(maxAgeHours: number = 24): Promise<void> {
    try {
      const files = fs.readdirSync(this.exportsDir);
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);

      for (const file of files) {
        const filePath = path.join(this.exportsDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up old export file: ${file}`);
        }
      }
    } catch (error) {
      console.warn('Error during export cleanup:', error);
    }
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      healthy: fs.existsSync(this.exportsDir),
      exportsDir: this.exportsDir,
      writable: this.checkWriteAccess()
    };
  }

  private checkWriteAccess(): boolean {
    try {
      const testFile = path.join(this.exportsDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }
}

export const simpleExportService = SimpleExportService.getInstance();