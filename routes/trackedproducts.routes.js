const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
  generateTrackedProductsData,
  getTrackedProducts,
  getTrackedProductsFromAnOrder: getTrackedProdcutsFromAnOrder,
  getStorageReport,
  addProductVelocityAndUnitsSold
} = require('../controllers/trackedproducts.controller');

router.get('/ranks', addAccessTokenHeader, generateTrackedProductsData);
router.get('/velocity', addAccessTokenHeader, addProductVelocityAndUnitsSold);
router.get('/storage-report', getStorageReport)
router.get('/', getTrackedProducts);
router.get('/order/:id', getTrackedProdcutsFromAnOrder);

module.exports = router;
