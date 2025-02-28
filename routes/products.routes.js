const express = require('express');

const {
  addExtraInfoToProduct,
  toggleShowProduct,
  getProducts,
  createProduct,
  deleteProduct
} = require('../controllers/products.controller');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');

const router = express.Router();
// Aplicar autenticación a todas las rutas dentro de este router
router.use(authMiddleware);

router.get('/', roleMiddleware(['admin', 'warehouse']), getProducts);

router.post('/', roleMiddleware(['admin', 'warehouse']), addAccessTokenHeader, createProduct);

router.patch(
  '/addExtraInfoToProduct',
  roleMiddleware(['admin', 'warehouse']),

  addExtraInfoToProduct
);

router.patch('/disable', roleMiddleware(['admin', 'manager']), toggleShowProduct);



router.delete('/:id', roleMiddleware(['admin', 'manager']), deleteProduct)


module.exports = router;
