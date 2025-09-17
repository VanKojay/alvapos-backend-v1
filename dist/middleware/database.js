"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.poolSmartjmp = exports.poolAlvamitra = void 0;
exports.initMySQLPool = initMySQLPool;
exports.mysqlMiddleware = mysqlMiddleware;
const promise_1 = __importDefault(require("mysql2/promise"));
const logger_1 = require("../utils/logger");
async function initMySQLPool() {
    exports.poolAlvamitra = promise_1.default.createPool({
        host: process.env.MYSQL_ALVAMITRA_HOST,
        port: parseInt(process.env.MYSQL_ALVAMITRA_PORT || '3306'),
        user: process.env.MYSQL_ALVAMITRA_USER,
        password: process.env.MYSQL_ALVAMITRA_PASSWORD,
        database: process.env.MYSQL_ALVAMITRA_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    });
    exports.poolSmartjmp = promise_1.default.createPool({
        host: process.env.MYSQL_SMARTJMP_HOST,
        port: parseInt(process.env.MYSQL_SMARTJMP_PORT || '3306'),
        user: process.env.MYSQL_SMARTJMP_USER,
        password: process.env.MYSQL_SMARTJMP_PASSWORD,
        database: process.env.MYSQL_SMARTJMP_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    });
    try {
        const [rows1] = await exports.poolAlvamitra.query('SELECT 1 AS connected');
        logger_1.Logger.info(`✅ Connected to db_alvamitra: ${JSON.stringify(rows1)}`);
        const [rows2] = await exports.poolSmartjmp.query('SELECT 1 AS connected');
        logger_1.Logger.info(`✅ Connected to db_smartjmp: ${JSON.stringify(rows2)}`);
    }
    catch (error) {
        logger_1.Logger.error('❌ MySQL connection failed:', error);
        process.exit(1);
    }
}
function mysqlMiddleware() {
}
//# sourceMappingURL=database.js.map