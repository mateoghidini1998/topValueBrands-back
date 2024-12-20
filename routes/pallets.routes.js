const express = require('express')
const router = express.Router()
const { protect } = require('../middlewares/auth')

const {
    createPallet,
    getPallets,
    getPallet,
    deletePallet,
    updatePallet
} = require('../controllers/pallets.controller')
const { getPalletProductByPurchaseOrderProductId, getAllPalletProducts, getPalletProducts } = require('../controllers/palletproducts.controller')


router.post('/', createPallet)
router.get('/', protect, getPallets)
router.get('/:id', getPallet)
router.delete('/:id', protect, deletePallet)
router.put('/:id', protect, updatePallet)
router.get('/:purchaseorderproduct_id/palletproduct', getPalletProductByPurchaseOrderProductId)
router.get('/products/all', getAllPalletProducts)
router.get('/products/:id', getPalletProducts)

module.exports = router;