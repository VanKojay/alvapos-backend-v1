"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportError = void 0;
class ExportError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ExportError';
    }
}
exports.ExportError = ExportError;
//# sourceMappingURL=export.js.map