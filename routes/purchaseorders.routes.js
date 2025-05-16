const express = require('express');
const router = express.Router();

const {
  createPurchaseOrder,
  updatePurchaseOrder,
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
  getIncomingShipments,
  addOrUpdateProductInPurchaseOrder,
  updateIncomingOrderProducts,
  updateIncomingOrderNotes,
  mergePurchaseOrder,
  fixPurchaseOrderProductsProfit
} = require('../controllers/purchaseorders.controller');
const { protect } = require('../middlewares/auth');
const { addUPC } = require('../controllers/products.controller');

router.get('/', getPurchaseOrders);

router.get('/incoming-shipments', getIncomingShipments);

router.post('/', createPurchaseOrder);

router.put('/merge/:id', mergePurchaseOrder);

router.put('/:id', updatePurchaseOrder);
router.get('/:id', getPurchaseOrderById);

router.patch('/incoming-order-notes/:orderId', updateIncomingOrderNotes)

router.patch('/:id/status', updatePurchaseOrderStatus);

router.get('/download/:id', downloadPurchaseOrder);

router.delete('/delete/:id', deletePurchaseOrder);

router.get('/summary/:id', getPurchaseOrderSummary);

router.delete(
  '/purchaseorderproduct/:purchaseOrderProductId',
  deletePurchaseOrderProductFromAnOrder
);

router.patch('/update-incoming-order/:id', updateIncomingOrderProducts)

router.post('/add-products/:id', addOrUpdateProductInPurchaseOrder);


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


// Fix PO Products Profit
router.patch('/products/fix-profit', fixPurchaseOrderProductsProfit);

module.exports = router;
