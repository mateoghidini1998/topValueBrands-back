const express = require('express');
const router = express.Router();
const {
    getSuppliers,
    getSupplier,
    createSupplier,
    updateSupplier,
    deleteSupplier
} = require('../controllers/suppliers.controller');

router.get('/', getSuppliers);
router.get('/:id', getSupplier);
router.patch('/:id', updateSupplier);
router.post('/', createSupplier);
router.delete('/:id', deleteSupplier);

module.exports = router;