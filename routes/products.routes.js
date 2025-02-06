const express = require('express');

const {
  addExtraInfoToProduct,
  toggleShowProduct,
  getProducts,
  createProduct,
} = require('../controllers/products.controller');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');

const router = express.Router();
// Aplicar autenticación a todas las rutas dentro de este router
router.use(authMiddleware);

router.post('/add', addAccessTokenHeader, createProduct);
router.get('/', roleMiddleware(['admin', 'warehouse']), getProducts);

router.post('/', roleMiddleware(['admin', 'warehouse']), createProduct);

router.patch(
  '/addExtraInfoToProduct',
  roleMiddleware(['admin', 'warehouse']),

  addExtraInfoToProduct
);

router.patch('/disable', roleMiddleware(['admin', 'manager']), toggleShowProduct);


module.exports = router;
