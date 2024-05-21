const express = require('express');
const router = express.Router();

const {
    getProductsTrackedData
} = require('../controllers/pogenerator.controller');

router.get('/', getProductsTrackedData);

module.exports = router;