import { EventEmitter } from 'events';
export interface RealTimeMessage {
    type: 'quote_updated' | 'customer_updated' | 'calculation_sync' | 'connection_status' | 'error';
    sessionId: string;
    data?: any;
    timestamp: string;
    messageId: string;
}
export interface ConnectionState {
    isConnected: boolean;
    connectionId?: string;
    lastHeartbeat?: string;
    reconnectAttempts: number;
    subscriptions: string[];
}
export interface CalculationSyncPayload {
    quoteId: string;
    cartData: any;
    taxRate: number;
    totals: any;
    calculatedAt: string;
}
export interface OptimisticUpdate {
    id: string;
    type: 'quote' | 'customer';
    operation: 'create' | 'update' | 'delete';
    data: any;
    timestamp: string;
    confirmed: boolean;
}
export declare class RealTimeSyncService extends EventEmitter {
    private static instance;
    constructor();
    static getInstance(): RealTimeSyncService;
    subscribeSession(sessionId: string): Promise<ConnectionState>;
    unsubscribeSession(sessionId: string): Promise<void>;
    getConnectionState(sessionId: string): ConnectionState | null;
    getConnectionStats(): any;
    syncCalculation(sessionId: string, quoteId: string, cartData: any, taxRate: number): Promise<{
        success: boolean;
        error?: string;
    }>;
    getActiveConnections(): any[];
    broadcastMessage(message: any): Promise<void>;
    shutdown(): Promise<void>;
    registerOptimisticUpdate(update: OptimisticUpdate): void;
}
export declare const realTimeSyncService: RealTimeSyncService;
//# sourceMappingURL=RealTimeSyncService.d.ts.map