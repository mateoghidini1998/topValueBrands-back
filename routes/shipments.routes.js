const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth')

const {
    createShipment,
    createShipmentByPurchaseOrder,
    getShipments,
    getShipment,
    deleteShipment,
    updateShipment,
    download2DWorkflowTemplate,
    getPalletsByPurchaseOrder,
    getPurchaseOrdersWithPallets,
    toggleProductChecked,
    addReferenceId,
    addFbaShipmentId,
    getShipmentTracking,
    checkAllShipmentProductsOfAPallet
} = require('../controllers/outgoingshipments.controller');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

router.post('/', createShipment)
router.post('/po/:id', protect, createShipmentByPurchaseOrder)
router.get('/tracking', addAccessTokenHeader, getShipmentTracking)
router.get('/', getShipments)
router.get('/:id', getShipment)
router.delete('/:id', deleteShipment)
router.put('/:id', protect, updateShipment)
router.get('/:id/download', download2DWorkflowTemplate);
router.get('/pallets/:purchase_order_id', protect, getPalletsByPurchaseOrder);
router.get('/purchaseorders/pallets', protect, getPurchaseOrdersWithPallets);
router.put('/checked/:outgoingShipmentProductId', toggleProductChecked);
router.put('/:shipmentId/pallets/:palletId/check', checkAllShipmentProductsOfAPallet);

router.patch('/reference/:id', addReferenceId)
router.patch('/reference/fba/:id', addFbaShipmentId)
module.exports = router;