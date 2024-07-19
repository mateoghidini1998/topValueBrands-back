const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
  generateTrackedProductsData,
  getTrackedProducts,
  getEstimateFees,
} = require('../controllers/trackedproducts.controller');
const { getProductsTrackedData, addProductVelocityAndUnitsSold } = require('../controllers/prueba');

router.get('/ranks', addAccessTokenHeader, generateTrackedProductsData);
router.get('/velocity', addAccessTokenHeader, addProductVelocityAndUnitsSold);


router.get('/', getTrackedProducts);
// router.get('/fees', addAccessTokenHeader, getEstimateFees)

router.get('/ranks-test', getProductsTrackedData);

module.exports = router;
