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
    getShipmentTracking
} = require('../controllers/outgoingshipments.controller');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

router.post('/', protect, createShipment)
router.post('/po/:id', protect, createShipmentByPurchaseOrder)
router.get('/', protect, getShipments)
router.get('/:id', protect, getShipment)
router.delete('/:id', protect, deleteShipment)
router.put('/:id', protect, updateShipment)
router.get('/:id/download', protect, download2DWorkflowTemplate);
router.get('/pallets/:purchase_order_id', protect, getPalletsByPurchaseOrder);
router.get('/purchaseorders/pallets', protect, getPurchaseOrdersWithPallets);
router.get('/tracking', addAccessTokenHeader, getShipmentTracking);
module.exports = router;