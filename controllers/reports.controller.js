const { sequelize, AmazonProductDetail } = require('../models');
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
    const productsInReport = new Set();

    // 1. Obtener todos los AmazonProductDetail con su Product
    const allDetails = await AmazonProductDetail.findAll({
      include: [{ model: Product, as: 'product' }],
      transaction: t,
    });

    const asinMap = new Map();
    for (const detail of allDetails) {
      asinMap.set(detail.ASIN, detail);
    }

    // 2. Procesar productos del reporte
    for (const product of productsArray) {
      const asin = product.asin;
      productsInReport.add(asin);

      const existingDetail = asinMap.get(asin);

      if (existingDetail) {
        let needsUpdate = false;

        if (existingDetail.FBA_available_inventory !== parseFloat(product['afn-fulfillable-quantity'])) {
          existingDetail.FBA_available_inventory = parseFloat(product['afn-fulfillable-quantity']);
          needsUpdate = true;
        }

        if (existingDetail.reserved_quantity !== parseFloat(product['afn-reserved-quantity'])) {
          existingDetail.reserved_quantity = parseFloat(product['afn-reserved-quantity']);
          needsUpdate = true;
        }

        if (existingDetail.Inbound_to_FBA !== parseFloat(product['afn-inbound-shipped-quantity'])) {
          existingDetail.Inbound_to_FBA = parseFloat(product['afn-inbound-shipped-quantity']);
          needsUpdate = true;
        }

        if (!existingDetail.in_seller_account) {
          existingDetail.in_seller_account = true;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await existingDetail.save({ transaction: t });
          updatedProducts.push(existingDetail.Product);
        }
      } else {
        // Crear nuevo Product y su AmazonProductDetail
        const newProduct = await Product.create({
          product_name: product['product-name'],
          seller_sku: product.sku,
          in_seller_account: true,
        }, { transaction: t });

        const newDetail = await AmazonProductDetail.create({
          product_id: newProduct.id,
          ASIN: asin,
          FBA_available_inventory: parseFloat(product['afn-fulfillable-quantity']),
          reserved_quantity: parseFloat(product['afn-reserved-quantity']),
          Inbound_to_FBA: parseFloat(product['afn-inbound-shipped-quantity']),
        }, { transaction: t });

        newProduct.AmazonProductDetail = newDetail;
        newProducts.push(newProduct);
      }
    }

    // 3. Marcar como inactivos los productos que no están en el reporte
    for (const [asin, detail] of asinMap) {
      if (!productsInReport.has(asin)) {
        if (detail.in_seller_account !== false) {
          detail.in_seller_account = false;
          await detail.save({ transaction: t });
          updatedProducts.push(detail.Product);
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