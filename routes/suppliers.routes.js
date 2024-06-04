const express = require('express');
const router = express.Router();
const { 
    getSuppliers, 
    getSupplier,
    createSupplier,
    updateSupplier
} = require('../controllers/suppliers.controller');

router.get('/', getSuppliers);
router.get('/:id', getSupplier);
router.put('/:id', updateSupplier);
router.post('/', createSupplier);

module.exports = router;