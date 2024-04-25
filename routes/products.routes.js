const express = require('express');
const router = express.Router();
// const { protect } = require('../middlewares/auth');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
    getInventorySummary,
    getAllInventorySummary,
    addExtraInfoToProduct,
    getReport
} = require('../controllers/products.controller');

router.get('/report', addAccessTokenHeader, getReport);
router.get('/inventorySummary', addAccessTokenHeader, getInventorySummary);
router.get('/inventorySummary/all', addAccessTokenHeader, getAllInventorySummary);
router.put('/addExtraInfoToProduct', addExtraInfoToProduct);


module.exports = router;