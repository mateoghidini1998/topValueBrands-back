const express = require('express');
const router = express.Router();

const {
  createPurchaseOrder,
  updatedPurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrders,
  downloadPurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  getPurchaseOrderSummaryByID: getPurchaseOrderSummary,
} = require('../controllers/purchaseorders.controller');
const { protect } = require('../middlewares/auth');

router.get('/', getPurchaseOrders);
router.post('/', createPurchaseOrder);
router.put('/:id', updatedPurchaseOrder);
router.get('/:id', getPurchaseOrderById);

// change purchase order status
router.patch('/:id/status', updatePurchaseOrderStatus);

// download purchase order
router.get('/download/:id', downloadPurchaseOrder);

// delete purchase order
router.delete('/delete/:id', deletePurchaseOrder);

router.get('/summary/:id', protect, getPurchaseOrderSummary);

module.exports = router;
