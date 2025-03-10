
const { sequelize } = require('../models');
const path = require('path');
const fs = require('fs');

const asyncHandler = require('../middlewares/async');
const { Product } = require('../models');
const { sendCSVasJSON, updateDangerousGoodsFromReport } = require('../utils/utils');
const {

  addImageToNewProducts,
} = require('../controllers/products.controller');
const { fetchNewTokenForFees } = require('../middlewares/lwa_token');
const logger = require('../logger/logger');

//@route   POST api/reports
//@desc    Generate new report
//@access  private
exports.syncDBWithAmazon = asyncHandler(async (req, res, next) => {

  logger.info('fetching new token for sync db with amazon...');
  let accessToken = await fetchNewTokenForFees();
  console.log(accessToken);

  try {

    if (!accessToken) {
      logger.info('fetching new token for sync db with amazon...');
      accessToken = await fetchNewTokenForFees();
      req.headers['x-amz-access-token'] = accessToken;
    } else {
      logger.info('Token is still valid...');
    }


    // Call createReport and get the reportId
    const report = await sendCSVasJSON(req, res, next);
    logger.info('Finish creating report');
    // Continue with the rest of the code after sendCSVasJSON has completed
    const newSync = await processReport(report);
    const imageSyncResult = await addImageToNewProducts(accessToken);

    res.json({ newSync, imageSyncResult });
    return { newSync, imageSyncResult };
  } catch (error) {
    next(error);
  }
});


exports.updateDangerousGoodsFromReport = asyncHandler(async (req, res, next) => {

  logger.info('fetching new token for sync db with amazon...');
  let accessToken = await fetchNewTokenForFees();

  try {

    if (!accessToken) {
      logger.info('fetching new token for sync db with amazon...');
      accessToken = await fetchNewTokenForFees();
      req.headers['x-amz-access-token'] = accessToken;
    } else {
      logger.info('Token is still valid...');
    }

    const reqDGItems = {
      body: {
        reportType: 'GET_FBA_STORAGE_FEE_CHARGES_DATA',
        marketplaceIds: [process.env.MARKETPLACE_US_ID],
        dataStartTime: "2025-01-01T00:00:00Z",
        dataEndTime: "2025-01-31T00:00:00Z",
        custom: true,
      },
      headers: {
        "x-amz-access-token": accessToken,
      },
    };

    return await updateDangerousGoodsFromReport(reqDGItems, res, next);

  } catch (error) {
    next(error);
  }
});

const processReport = async (productsArray) => {
  logger.info('Start processReport function');
  const t = await sequelize.transaction();
  try {
    const newProducts = [];
    const updatedProducts = [];
    const touchedProducts = new Set();  // Para llevar el control de productos "tocados"

    // Obtener todos nuestros productos de la base de datos
    const allOurProducts = await Product.findAll({ transaction: t });
    const ourProductsMap = new Map();

    for (const product of allOurProducts) {
      ourProductsMap.set(product.ASIN, product);
    }

    for (const product of productsArray) {
      const existingProduct = ourProductsMap.get(product.asin);

      if (existingProduct) {
        touchedProducts.add(existingProduct.ASIN);  // Marcamos como tocado
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
        // Crear nuevo producto
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

    // Identificar productos en la base de datos que no han sido tocados
    for (const [asin, product] of ourProductsMap) {
      if (!touchedProducts.has(asin)) {
        // Actualizamos el producto a `in_seller_account: false`
        product.in_seller_account = false;
        await product.save({ transaction: t });
        updatedProducts.push(product);  // Añadimos a la lista de actualizados
      }
    }

    await t.commit();

    logger.info('Finish processReport function');
    return {
      newSyncProductsQuantity: newProducts.length,
      newSyncQuantity: updatedProducts.length,
      newSyncProducts: newProducts,
      newSyncData: updatedProducts,
    };
  } catch (error) {
    await t.rollback();
    console.error('Error al actualizar o crear productos:', error);
    logger.error('Error al actualizar o crear productos:', error);
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
