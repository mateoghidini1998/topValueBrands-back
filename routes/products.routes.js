const express = require('express');
const router = express.Router();
// const { protect } = require('../middlewares/auth');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');
const { authorize } = require('../middlewares/auth');
const { protect } = require('../middlewares/auth');

const {
    getInventorySummary,
    getAllInventorySummary,
    addExtraInfoToProduct,
    getReport,
    toggleShowProduct,
} = require('../controllers/products.controller');

router.get('/report', protect, authorize("admin"),addAccessTokenHeader, getReport);
router.get('/inventorySummary', protect, authorize("admin"),addAccessTokenHeader, getInventorySummary);
router.get('/inventorySummary/all', protect, authorize("admin"),addAccessTokenHeader, getAllInventorySummary);
router.put('/addExtraInfoToProduct', protect, authorize("admin"),addExtraInfoToProduct);
router.delete('/disable', protect, authorize("admin"), toggleShowProduct);

module.exports = router;