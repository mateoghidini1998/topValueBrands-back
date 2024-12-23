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
  addExpireDateToPOProduct,
  deletePurchaseOrderProductFromAnOrder,
  updatePONumber,
  addProductToPurchaseOrder,
} = require('../controllers/purchaseorders.controller');
const { protect } = require('../middlewares/auth');
const { addUPC } = require('../controllers/products.controller');

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

// delete purchase order product of and order by ID
router.delete(
  '/purchaseorderproduct/:purchaseOrderProductId',
  deletePurchaseOrderProductFromAnOrder
);

// add products to existing purchase order
router.post('/add-products/:id', addProductToPurchaseOrder);

//update purchase order number

router.patch('/orderNumber/:id', updatePONumber);

router.patch('/received/:purchaseOrderProductId', addQuantityReceived);

router.patch('/:id/products', updatePurchaseOrderProducts);
router.patch('/:id/addUPC', addUPC);

// add notes to purchase order product
router.patch('/notes/:purchaseOrderProductId', addNotesToPurchaseOrderProduct);

// add reason to purchase order product
router.patch('/reason/:purchaseOrderProductId', addReasonToPOProduct);

// add expire date to purchase order product
router.patch('/expireDate/:purchaseOrderProductId', addExpireDateToPOProduct);

module.exports = router;
