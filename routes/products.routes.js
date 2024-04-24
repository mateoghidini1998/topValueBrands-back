const express = require('express');
const router = express.Router();
// const { protect } = require('../middlewares/auth');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
    getInventorySummary,
    addExtraInfoToProduct
} = require('../controllers/products.controller');

router.get('/inventorySummary', addAccessTokenHeader, getInventorySummary);
router.put('/addExtraInfoToProduct', addExtraInfoToProduct);


module.exports = router;