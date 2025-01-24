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
} = require('../controllers/outgoingshipments.controller');

router.post('/', createShipment)
router.post('/po/:id', protect, createShipmentByPurchaseOrder)
router.get('/', getShipments)
router.get('/:id', getShipment)
router.delete('/:id', deleteShipment)
router.put('/:id', protect, updateShipment)
router.get('/:id/download', download2DWorkflowTemplate);
router.get('/pallets/:purchase_order_id', protect, getPalletsByPurchaseOrder);
router.get('/purchaseorders/pallets', protect, getPurchaseOrdersWithPallets);
module.exports = router;