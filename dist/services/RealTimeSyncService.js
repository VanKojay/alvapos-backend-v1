"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realTimeSyncService = exports.RealTimeSyncService = void 0;
const events_1 = require("events");
const logger_1 = require("../utils/logger");
class RealTimeSyncService extends events_1.EventEmitter {
    constructor() {
        super();
        logger_1.Logger.info('RealTimeSyncService stub initialized (functionality disabled)');
    }
    static getInstance() {
        if (!RealTimeSyncService.instance) {
            RealTimeSyncService.instance = new RealTimeSyncService();
        }
        return RealTimeSyncService.instance;
    }
    async subscribeSession(sessionId) {
        return {
            isConnected: false,
            reconnectAttempts: 0,
            subscriptions: []
        };
    }
    async unsubscribeSession(sessionId) {
        logger_1.Logger.debug(`Real-time unsubscription attempted for session ${sessionId} - disabled`);
    }
    getConnectionState(sessionId) {
        return {
            isConnected: false,
            reconnectAttempts: 0,
            subscriptions: []
        };
    }
    getConnectionStats() {
        return {
            activeConnections: 0,
            status: 'disabled',
            message: 'Real-time functionality disabled for PostgreSQL conversion'
        };
    }
    async syncCalculation(sessionId, quoteId, cartData, taxRate) {
        return {
            success: false,
            error: 'Real-time sync functionality disabled for PostgreSQL conversion'
        };
    }
    getActiveConnections() {
        return [];
    }
    async broadcastMessage(message) {
        logger_1.Logger.debug('Broadcast message attempted - real-time functionality disabled');
    }
    async shutdown() {
        logger_1.Logger.info('RealTimeSyncService stub shutdown completed');
    }
    registerOptimisticUpdate(update) {
        logger_1.Logger.debug('Optimistic update attempted - real-time functionality disabled', {
            id: update.id,
            type: update.type,
            operation: update.operation
        });
    }
}
exports.RealTimeSyncService = RealTimeSyncService;
exports.realTimeSyncService = RealTimeSyncService.getInstance();
//# sourceMappingURL=RealTimeSyncService.js.map