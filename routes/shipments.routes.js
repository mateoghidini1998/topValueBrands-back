const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth')

const {
    createShipment,
    getShipments,
    getShipment,
    deleteShipment
} = require('../controllers/outgoingshipments.controller')

router.post('/', protect, createShipment)
router.get('/', protect, getShipments)
router.get('/:id', protect, getShipment)
router.delete('/:id', protect, deleteShipment)

module.exports = router;