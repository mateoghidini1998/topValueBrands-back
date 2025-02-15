const express = require('express');

const {
  addExtraInfoToProduct,
  deleteProduct,
  getProducts,
  createProduct,
} = require('../controllers/products.controller');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');

const router = express.Router();
/* router.use(authMiddleware); */

router.get('/', roleMiddleware(['admin', 'warehouse']), getProducts);

router.post('/', roleMiddleware(['admin', 'warehouse']), addAccessTokenHeader, createProduct);

router.patch(
  '/addExtraInfoToProduct',
  roleMiddleware(['admin', 'warehouse']),

  addExtraInfoToProduct
);

router.patch('/:id', deleteProduct);


module.exports = router;
