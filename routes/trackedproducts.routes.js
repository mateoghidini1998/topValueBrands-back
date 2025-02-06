const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
  generateTrackedProductsData,
  getTrackedProducts,
  getTrackedProductsFromAnOrder: getTrackedProdcutsFromAnOrder
} = require('../controllers/trackedproducts.controller');
const { getProductsTrackedData, addProductVelocityAndUnitsSold } = require('../controllers/prueba');

router.get('/ranks', addAccessTokenHeader, generateTrackedProductsData);
router.get('/velocity', addAccessTokenHeader, addProductVelocityAndUnitsSold);


router.get('/', getTrackedProducts);

router.get('/ranks-test', getProductsTrackedData);

router.get('/order/:id', getTrackedProdcutsFromAnOrder);

module.exports = router;
