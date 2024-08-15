const { Sequelize, Op } = require('sequelize');
const { sequelize } = require('../models');
const path = require('path');
const fs = require('fs');

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

// const processReport = async (productsArray) => {
//   try {
//     const newProducts = [];
//     const updatedProducts = [];

//     //Check if there is any difference between our products and the productsArray passed by props.
//     const allOurProducts = await Product.findAll();


//     for (const product of productsArray) {
//       const [result, created] = await Product.upsert({
//         ASIN: product.asin,
//         product_name: product['product-name'],
//         seller_sku: product.sku,
//         in_seller_account: true,
//         FBA_available_inventory: parseFloat(
//           product['afn-fulfillable-quantity']
//         ),
//         reserved_quantity: parseFloat(product['afn-reserved-quantity']),
//         Inbound_to_FBA: parseFloat(product['afn-inbound-shipped-quantity']),
//       });

//       if (created) {
//         newProducts.push(product);
//       } else {
//         updatedProducts.push(product);
//       }
//     }

//     return {
//       newSyncProductsQuantity: newProducts.length,
//       newSyncQuantity: updatedProducts.length,
//       newSyncProducts: newProducts,
//       newSyncData: updatedProducts,
//     };
//   } catch (error) {
//     console.error('Error al actualizar o crear productos:', error);
//     throw error;
//   }
// };

const processReport = async (productsArray) => {
  const t = await sequelize.transaction();
  try {
    const newProducts = [];
    const updatedProducts = [];

    // Obtener todos nuestros productos de la base de datos
    const allOurProducts = await Product.findAll({ transaction: t });
    const ourProductsMap = new Map();

    for (const product of allOurProducts) {
      ourProductsMap.set(product.ASIN, product);
    }

    for (const product of productsArray) {
      const existingProduct = ourProductsMap.get(product.asin);

      if (existingProduct) {
        let needsUpdate = false;

        // Comparar los valores
        if (existingProduct.FBA_available_inventory !== parseFloat(product['afn-fulfillable-quantity'])) {
          needsUpdate = true;
          existingProduct.FBA_available_inventory = parseFloat(product['afn-fulfillable-quantity']);
        }
        if (existingProduct.reserved_quantity !== parseFloat(product['afn-reserved-quantity'])) {
          needsUpdate = true;
          existingProduct.reserved_quantity = parseFloat(product['afn-reserved-quantity']);
        }
        if (existingProduct.Inbound_to_FBA !== parseFloat(product['afn-inbound-shipped-quantity'])) {
          needsUpdate = true;
          existingProduct.Inbound_to_FBA = parseFloat(product['afn-inbound-shipped-quantity']);
        }

        if (needsUpdate) {
          await existingProduct.save({ transaction: t });
          updatedProducts.push(existingProduct);
        }
      } else {
        const newProduct = await Product.create({
          ASIN: product.asin,
          product_name: product['product-name'],
          seller_sku: product.sku,
          in_seller_account: true,
          FBA_available_inventory: parseFloat(product['afn-fulfillable-quantity']),
          reserved_quantity: parseFloat(product['afn-reserved-quantity']),
          Inbound_to_FBA: parseFloat(product['afn-inbound-shipped-quantity']),
        }, { transaction: t });

        newProducts.push(newProduct);

      }
    }

    await t.commit();

    return {
      newSyncProductsQuantity: newProducts.length,
      newSyncQuantity: updatedProducts.length,
      newSyncProducts: newProducts,
      newSyncData: updatedProducts,
    };
  } catch (error) {
    await t.rollback();
    console.error('Error al actualizar o crear productos:', error);
    throw error;
  }
};

// @route    GET api/reports/download/:filename
// @desc     Download a CSV file
// @access   Private
exports.downloadReport = asyncHandler(async (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../reports', filename);

  // Verifica si el archivo existe
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ msg: 'File not found' });
  }

  // Establece el encabezado para la descarga del archivo
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.setHeader('Content-Type', 'text/csv');

  // Envía el archivo como respuesta
  res.download(filePath, (err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ msg: 'Error downloading file' });
    }
  });
});
