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
  addQuantityReceived,
  updatePurchaseOrderProducts,
  addNotesToPurchaseOrderProduct,
  addReasonToPOProduct,
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

router.patch('/received/:purchaseOrderProductId', addQuantityReceived);

router.patch('/:id/products', updatePurchaseOrderProducts);

// add notes to purchase order product
router.patch('/notes/:purchaseOrderProductId', addNotesToPurchaseOrderProduct);

// add reason to purchase order product
router.patch('/reason/:purchaseOrderProductId', addReasonToPOProduct);

module.exports = router;
