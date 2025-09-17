"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const exportSecurity_1 = require("../middleware/exportSecurity");
const router = (0, express_1.Router)();
router.use((0, exportSecurity_1.securityHeaders)());
router.use((0, exportSecurity_1.sanitizeInput)());
router.get('/health', async (req, res) => {
    try {
        res.status(200).json({
            healthy: true,
            timestamp: new Date().toISOString(),
            message: 'Export service is healthy'
        });
    }
    catch (error) {
        res.status(503).json({
            healthy: false,
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
});
router.use((error, req, res, next) => {
    console.error('Export API error:', error.message);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
});
exports.default = router;
//# sourceMappingURL=export.js.map