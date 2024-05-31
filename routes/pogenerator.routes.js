const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token')

const {
    generateTrackedProductsData,
    getTrackedProducts
} = require('../controllers/trackedproducts.controller')

router.get('/trackedproducts', addAccessTokenHeader, generateTrackedProductsData);
router.get('/', getTrackedProducts)

module.exports = router;