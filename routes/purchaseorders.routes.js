const express = require('express');
const router = express.Router();

const {
  createPurchaseOrder,
  updatedPurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrders,
  rejectPurchaseOrder,
  approvePurchaseOrder,
  downloadPurchaseOrder,
  deletePurchaseOrder
} = require('../controllers/purchaseorders.controller');
const { protect } = require('../middlewares/auth');

router.get('/', getPurchaseOrders);
router.post('/', createPurchaseOrder);
router.put('/:id', updatedPurchaseOrder);
router.get('/:id', getPurchaseOrderById);
// change purchase order status
router.patch('/reject/:id', rejectPurchaseOrder);
router.patch('/approve/:id', approvePurchaseOrder);
router.get('/download/:id', downloadPurchaseOrder);

// delete purchase order
router.delete('/delete/:id', deletePurchaseOrder);

module.exports = router;
