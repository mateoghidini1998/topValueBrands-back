const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
  getTrackedProducts,
  getTrackedProductsFromAnOrder,
} = require('../controllers/trackedproducts.controller');

router.get('/', getTrackedProducts);
router.get('/order/:id', getTrackedProductsFromAnOrder);

module.exports = router;
