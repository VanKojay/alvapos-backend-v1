import express, { Application } from 'express';
declare class ALVAPOSServer {
    app: Application;
    private server;
    constructor();
    private setupGlobalErrorHandlers;
    private setupDatabase;
    private setupMiddleware;
    private setupRoutes;
    private setupErrorHandling;
    start(): Promise<void>;
    private gracefulShutdown;
    private logServerStats;
}
declare const server: ALVAPOSServer;
export { server };
declare const _default: express.Application;
export default _default;
//# sourceMappingURL=server.d.ts.map