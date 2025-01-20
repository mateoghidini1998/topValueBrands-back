const express = require('express');
const router = express.Router();
const { authorize, protect } = require('../middlewares/auth');

const {
  addExtraInfoToProduct,
  toggleShowProduct,
  getProducts,
  getProductBySellerSku,
  addImageToAllProducts,
  addImageToNewProducts,
  createProduct,
} = require('../controllers/products.controller');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');
const { requireAuth } = require('@clerk/express');

router.post('/add', addAccessTokenHeader, createProduct);

/**
 * @openapi
 * /api/v1/products:
 *   get:
 *     summary: Get all products
 *     description: Retrieve a list of all products. Requires admin authentication.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []   # Esquema de autenticación utilizando un token JWT
 *     responses:
 *       '200':
 *         description: Successfully retrieved list of products.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total:
 *                   type: integer
 *                   example: 1859
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       ASIN:
 *                         type: string
 *                         example: "B000HHM9WI"
 *                       product_image:
 *                         type: string
 *                         nullable: true
 *                       product_name:
 *                         type: string
 *                         example: "ANIMED Pure MSM 5lb"
 *                       seller_sku:
 *                         type: string
 *                         example: "00-WTH3-LMPN"
 *                       FBA_available_inventory:
 *                         type: integer
 *                         example: 0
 *                       reserved_quantity:
 *                         type: integer
 *                         example: 0
 *                       Inbound_to_FBA:
 *                         type: integer
 *                         example: 0
 *                       supplier_name:
 *                         type: string
 *                         example: "Florida Hardware"
 *                       supplier_item_number:
 *                         type: string
 *                         example: "053-90059"
 *                       product_cost:
 *                         type: number
 *                         example: 17.67
 *                       pack_type:
 *                         type: string
 *                         nullable: true
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-04-29T21:11:02.000Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-04-29T21:14:49.000Z"
 *       '401':
 *         description: Unauthorized error due to missing or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: Not authorized to access this route
 */
router.get('/', requireAuth(), getProducts);

// get product by seller_sku
router.get('/:seller_sku', getProductBySellerSku);

router.post('/', createProduct);

/**
 * @openapi
 * /api/v1/products/addExtraInfoToProduct:
 *   patch:
 *     summary: Add extra information to a product
 *     description: Add extra information to a product identified by its seller SKU. Requires admin authentication.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []   # Esquema de autenticación utilizando un token JWT
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Token de autenticación JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               seller_sku:
 *                 type: string
 *                 example: King-1
 *               supplier_name:
 *                 type: string
 *                 example: HOLAA
 *               supplier_item_number:
 *                 type: string
 *                 example: "10"
 *               product_cost:
 *                 type: number
 *                 example: 100.50
 *               pack_type:
 *                 type: string
 *                 example: asdasd
 *     responses:
 *       '200':
 *         description: Successfully added extra information to the product.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1053
 *                 ASIN:
 *                   type: string
 *                   example: B097HNGY47
 *                 product_image:
 *                   type: string
 *                   nullable: true
 *                 product_name:
 *                   type: string
 *                   example: Snicky Snaks Poppers, All Natural, Oven Baked Dog Treats Pack of 2 � Made from Scratch, No Wheat, No Corn, No Soy � Made in The USA Dog Treats, Training Treats (Peanut Butter)
 *                 seller_sku:
 *                   type: string
 *                   example: King-1
 *                 FBA_available_inventory:
 *                   type: integer
 *                   example: 0
 *                 reserved_quantity:
 *                   type: integer
 *                   example: 0
 *                 Inbound_to_FBA:
 *                   type: integer
 *                   example: 0
 *                 supplier_name:
 *                   type: string
 *                   example: HOLAA
 *                 supplier_item_number:
 *                   type: string
 *                   example: "10"
 *                 product_cost:
 *                   type: number
 *                   example: 100.5
 *                 pack_type:
 *                   type: string
 *                   example: asdasd
 *                 is_active:
 *                   type: boolean
 *                   example: true
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-04-29T19:56:38.000Z"
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-04-29T21:04:05.079Z"
 *       '401':
 *         description: Unauthorized error due to missing or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: Not authorized to access this route
 */
router.patch(
  '/addExtraInfoToProduct',


  addExtraInfoToProduct
);

/**
 * @openapi
 * /api/v1/products/disable:
 *   patch:
 *     summary: Disable a product
 *     description: Disable a product identified by its seller SKU. Requires admin authentication.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []   # Esquema de autenticación utilizando un token JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               seller_sku:
 *                 type: string
 *                 example: 00-WTH3-LMPN
 *     responses:
 *       '200':
 *         description: Successfully disabled the product.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 ASIN:
 *                   type: string
 *                   example: B000HHM9WI
 *                 product_image:
 *                   type: string
 *                   nullable: true
 *                 product_name:
 *                   type: string
 *                   example: ANIMED Pure MSM 5lb
 *                 seller_sku:
 *                   type: string
 *                   example: 00-WTH3-LMPN
 *                 FBA_available_inventory:
 *                   type: integer
 *                   example: 0
 *                 reserved_quantity:
 *                   type: integer
 *                   example: 0
 *                 Inbound_to_FBA:
 *                   type: integer
 *                   example: 0
 *                 supplier_name:
 *                   type: string
 *                   example: Florida Hardware
 *                 supplier_item_number:
 *                   type: string
 *                   example: 053-90059
 *                 product_cost:
 *                   type: number
 *                   example: 17.67
 *                 pack_type:
 *                   type: string
 *                   nullable: true
 *                 is_active:
 *                   type: boolean
 *                   example: false
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-04-29T21:11:02.000Z"
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-04-30T00:08:50.326Z"
 *       '401':
 *         description: Unauthorized error due to missing or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: Not authorized to access this route
 */
router.patch('/disable', toggleShowProduct);

router.patch('/addImage', addAccessTokenHeader, addImageToAllProducts);

router.patch(
  '/syncImages',


  addAccessTokenHeader,
  addImageToNewProducts
);


module.exports = router;
