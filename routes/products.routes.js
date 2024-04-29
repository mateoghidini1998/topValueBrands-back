const express = require('express');
const router = express.Router();
const { authorize, protect } = require('../middlewares/auth');

const {
    addExtraInfoToProduct,
    toggleShowProduct,
    getProducts,
} = require('../controllers/products.controller');
router.get('/', protect, authorize("admin"), getProducts);
router.patch('/addExtraInfoToProduct', protect, authorize("admin"), addExtraInfoToProduct);
router.patch('/disable', protect, authorize("admin"), toggleShowProduct);

module.exports = router;