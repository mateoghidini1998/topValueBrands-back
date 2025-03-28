
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
        dataStartTime: req.body.dataStartTime,
        dataEndTime: req.body.dataEndTime,
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
    const productsInReport = new Set();  // Para llevar control de productos presentes en el reporte

    // 1. Obtener todos nuestros productos de la base de datos
    const allOurProducts = await Product.findAll({ transaction: t });
    const ourProductsMap = new Map();

    for (const product of allOurProducts) {
      ourProductsMap.set(product.ASIN, product);
    }


    // 2. Procesar productos del reporte
    for (const product of productsArray) {

      productsInReport.add(product.asin);  // Marcamos como presente en el reporte
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

        // Siempre asegurar que in_seller_account sea true (está en el reporte)
        if (!existingProduct.in_seller_account) {
          needsUpdate = true;
          existingProduct.in_seller_account = true;
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

    // 3. Actualizar productos que NO están en el reporte
    for (const [asin, product] of ourProductsMap) {
      if (!productsInReport.has(asin)) {
        // Producto en BD pero no en reporte → marcar como false
        if (product.in_seller_account !== false) {
          product.in_seller_account = false;
          await product.save({ transaction: t });
          updatedProducts.push(product);
        }
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
// 