const asyncHandler = require('../middlewares/async');
const { Product } = require('../models');
const { sendCSVasJSON } = require('../utils/utils');
const {
  addImageToProducts,
  addImageToNewProducts,
} = require('../controllers/products.controller');

//@route   POST api/reports
//@desc    Generate new report
//@access  private
exports.syncDBWithAmazon = asyncHandler(async (req, res, next) => {
  try {
    // Call createReport and get the reportId
    const report = await sendCSVasJSON(req, res, next);

    // Continue with the rest of the code after sendCSVasJSON has completed
    const newSync = await processReport(report);

    // Call addImageToProducts to add images to new products
    // const newProducts = await Product.findAll({ where: { product_image: null } || { product_image: '' } });
    const accessToken = req.headers['x-amz-access-token'];
    // const imageSyncResult = await addImageToProducts(newProducts, accessToken);
    const imageSyncResult = await addImageToNewProducts(accessToken);

    res.json({ newSync, imageSyncResult });
    return { newSync, imageSyncResult };
  } catch (error) {
    // Handle any errors
    next(error);
  }
});

const processReport = async (productsArray) => {
  try {
    const newProducts = [];
    const updatedProducts = [];

    for (const product of productsArray) {
      const [result, created] = await Product.upsert({
        ASIN: product.asin,
        product_name: product['product-name'],
        seller_sku: product.sku,
        in_seller_account: true,
        FBA_available_inventory: parseFloat(
          product['afn-fulfillable-quantity']
        ),
        reserved_quantity: parseFloat(product['afn-reserved-quantity']),
        Inbound_to_FBA: parseFloat(product['afn-inbound-shipped-quantity']),
      });

      if (created) {
        newProducts.push(product);
      } else {
        updatedProducts.push(product);
      }
    }

    return {
      newSyncProductsQuantity: newProducts.length,
      newSyncQuantity: updatedProducts.length,
      newSyncProducts: newProducts,
      newSyncData: updatedProducts,
    };
  } catch (error) {
    console.error('Error al actualizar o crear productos:', error);
    throw error;
  }
};
