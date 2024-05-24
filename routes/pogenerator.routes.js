const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token')

const { 
    saveOrders
} = require('../controllers/orders.controller');

const { 
    getProductsTrackedData
} = require('../controllers/pogenerator.controller')

router.get('/', addAccessTokenHeader , saveOrders);
router.get('/getProductsRanks',  getProductsTrackedData);

module.exports = router;