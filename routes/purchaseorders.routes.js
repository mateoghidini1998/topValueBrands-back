const express = require('express');
const router = express.Router();

const {
  createPurchaseOrder,
  updatedPurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrders,
} = require('../controllers/purchaseorders.controller');

router.get('/', getPurchaseOrders);
router.post('/', createPurchaseOrder);
router.put('/:id', updatedPurchaseOrder);
router.get('/:id', getPurchaseOrderById);

module.exports = router;
