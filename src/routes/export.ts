// ALVA POS MVP - Export API Routes
// Simple export endpoints for MVP functionality

import { Router, Request, Response } from 'express';
import { 
  securityHeaders,
  sanitizeInput
} from '../middleware/exportSecurity';

interface AuthenticatedRequest {
  user?: {
    id: string;
    permissions: string[];
    role: string;
  };
  sessionId?: string;
  clientIP?: string;
  ip?: string;
  body?: any;
  query?: any;
  params?: any;
}

const router = Router();

// Apply security middleware to all routes
router.use(securityHeaders());
router.use(sanitizeInput());

/**
 * @route GET /api/v1/export/health
 * @desc Basic health check for export services
 * @access Public
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Simple health check
    res.status(200).json({
      healthy: true,
      timestamp: new Date().toISOString(),
      message: 'Export service is healthy'
    });
  } catch (error) {
    res.status(503).json({
      healthy: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Basic error handling middleware for this router
router.use((error: Error, req: Request, res: Response, next: Function) => {
  console.error('Export API error:', error.message);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

export default router;