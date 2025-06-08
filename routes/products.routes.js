const express = require('express');

const {
  addExtraInfoToProduct,
  toggleShowProduct,
  getProducts,
  createProduct,
  deleteProduct,
  updateDGType,
  getSupressedListings
} = require('../controllers/products.controller');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');

const router = express.Router();
// Aplicar autenticación a todas las rutas dentro de este router
/* router.use(authMiddleware);
 */
router.get('/', getProducts);

router.post('/', addAccessTokenHeader, createProduct);

router.patch(
  '/addExtraInfoToProduct',
  /* roleMiddleware(['admin', 'warehouse']), */

  addExtraInfoToProduct
);

router.get('/supressed', roleMiddleware(['admin', 'warehouse']), getSupressedListings);

router.patch('/dg-type/:productId', updateDGType)

router.patch('/disable', addAccessTokenHeader,toggleShowProduct);

router.delete('/:id', addAccessTokenHeader, deleteProduct)


module.exports = router;
