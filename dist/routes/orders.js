"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ordersRouter = void 0;
const DatabaseService_1 = require("../services/DatabaseService");
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.ordersRouter = router;
router.get('/', async (req, res) => {
    try {
        console.log("📝 [FETCH ORDERS REQUEST]");
        res.json({
            success: true,
            message: 'List of orders',
            data: [],
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: err.message,
        });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        res.json({
            success: true,
            message: `Order detail for ID: ${id}`,
            data: {},
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order',
            error: err.message,
        });
    }
});
router.post('/', async (req, res) => {
    const startTime = Date.now();
    try {
        const sessionId = res.locals.sessionId;
        const requestData = req.body;
        console.log("📝 [CREATE ORDER REQUEST]");
        console.log("Session ID:", sessionId);
        console.log("Headers:", req.headers);
        console.log("Body:", JSON.stringify(requestData, null, 2));
        const orderNumber = `ORD-${Date.now()}`;
        const alvamitraOrderData = {
            quote_number: orderNumber,
            id_pengguna: '66',
            organisasi_kode: '20191214071651',
            nomor_whatsapp: requestData.nomor_whatsapp,
            cart_data: requestData.cart_data || { items: [], laborItems: [] },
            notes: requestData.notes,
            tax_rate: requestData.tax_rate || 0.10
        };
        const orderResult = await DatabaseService_1.databaseService.createOrderAlvamitra(alvamitraOrderData);
        if (orderResult.error || !orderResult.data) {
            console.error('❌ Order creation failed |', {
                error: orderResult.error,
                sessionId: res.locals.requestId,
                responseTime: Date.now() - startTime
            });
            return res.status(500).json({
                success: false,
                error: 'Failed to create order',
                message: orderResult.error?.message || 'Unknown error',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        return res.status(201).json({
            success: true,
            data: {
                order_number: alvamitraOrderData.quote_number,
                masterId: orderResult.data.masterId,
                subId: orderResult.data.subId,
                items: orderResult.data.items,
                status: 'draft'
            },
            message: 'Order created successfully',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        });
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        console.error('❌ Order creation failed', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: res.locals.sessionId,
            responseTime
        });
        return res.status(500).json({
            success: false,
            error: 'Order creation failed',
            message: error instanceof Error ? error.message : 'Internal server error',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        res.json({
            success: true,
            message: `Order ${id} updated successfully`,
            data: updateData,
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to update order',
            error: err.message,
        });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        res.json({
            success: true,
            message: `Order ${id} deleted successfully`,
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete order',
            error: err.message,
        });
    }
});
//# sourceMappingURL=orders.js.map