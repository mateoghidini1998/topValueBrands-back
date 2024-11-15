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


router.post('/', createPallet)
router.get('/', protect, getPallets)
router.get('/:id', getPallet)
router.delete('/:id', protect, deletePallet)
router.put('/:id', protect, updatePallet)

module.exports = router;