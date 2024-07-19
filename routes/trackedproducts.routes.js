const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
  generateTrackedProductsData,
  getTrackedProducts,
  getEstimateFees,
} = require('../controllers/trackedproducts.controller');
const { getProductsTrackedData } = require('../controllers/prueba');

router.get('/ranks', addAccessTokenHeader, getProductsTrackedData);
router.get('/', getTrackedProducts);
router.get('/fees', addAccessTokenHeader, getEstimateFees)

module.exports = router;
