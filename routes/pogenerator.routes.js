const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token')

const {
    generateTrackedProductsData
} = require('../controllers/trackedproducts.controller')

router.get('/trackedproducts', addAccessTokenHeader, generateTrackedProductsData);

module.exports = router;