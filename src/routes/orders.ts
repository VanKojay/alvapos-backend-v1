// src/routes/ordersRouter.ts
import { databaseService } from '@/services/DatabaseService';
import { Router, Request, Response } from 'express';
// import { createOrderValidation } from '../validators/orderValidation';
// import { OrdersController } from '../controllers/ordersController';

const router = Router();

/**
 * GET /api/orders
 * Ambil semua orders
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // const orders = await OrdersController.getAllOrders();
    console.log("📝 [FETCH ORDERS REQUEST]");
    res.json({
      success: true,
      message: 'List of orders',
      data: [], // ganti dengan data dari DB
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: (err as Error).message,
    });
  }
});

/**
 * GET /api/orders/:id
 * Ambil detail order
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // const order = await OrdersController.getOrderById(id);
    res.json({
      success: true,
      message: `Order detail for ID: ${id}`,
      data: {}, // ganti dengan data dari DB
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/orders
 * Buat order baru
 */
router.post('/', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const sessionId = res.locals.sessionId;
    const requestData = req.body;

    console.log("📝 [CREATE ORDER REQUEST]");
    console.log("Session ID:", sessionId);
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(requestData, null, 2));

    // ✅ Generate Nomor Order (sementara random, bisa bikin helper mirip generateQuoteNumber)
    const orderNumber = `ORD-${Date.now()}`;

    // ✅ Siapkan payload buat Alvamitra
    const alvamitraOrderData = {
      quote_number: orderNumber, // di DB pakai field Nomor_Order
      id_pengguna: '66', // sebaiknya ambil dari session/login user
      organisasi_kode: '20191214071651',
      nomor_whatsapp: requestData.nomor_whatsapp,
      cart_data: requestData.cart_data || { items: [], laborItems: [] },
      notes: requestData.notes,
      tax_rate: requestData.tax_rate || 0.10
    };

    // ✅ Insert ke Alvamitra DB
    const orderResult = await databaseService.createOrderAlvamitra(alvamitraOrderData);

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

    // ✅ Return sukses
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

  } catch (error) {
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

/**
 * PUT /api/orders/:id
 * Update order
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    // const updatedOrder = await OrdersController.updateOrder(id, updateData);

    res.json({
      success: true,
      message: `Order ${id} updated successfully`,
      data: updateData,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update order',
      error: (err as Error).message,
    });
  }
});

/**
 * DELETE /api/orders/:id
 * Hapus order
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // await OrdersController.deleteOrder(id);

    res.json({
      success: true,
      message: `Order ${id} deleted successfully`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete order',
      error: (err as Error).message,
    });
  }
});

export { router as ordersRouter };
