const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
  generateTrackedProductsData,
  getTrackedProducts,
  getEstimateFees,
} = require('../controllers/trackedproducts.controller');
const { getProductsTrackedData, addProductVelocityAndUnitsSold } = require('../controllers/prueba');

router.get('/ranks', getProductsTrackedData);
router.get('/velocity', addAccessTokenHeader, addProductVelocityAndUnitsSold);


router.get('/', getTrackedProducts);
router.get('/fees', addAccessTokenHeader, getEstimateFees)

module.exports = router;
