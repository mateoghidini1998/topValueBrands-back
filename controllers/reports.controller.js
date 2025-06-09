const { sequelize, AmazonProductDetail } = require('../models');
const path = require('path');
const fs = require('fs');

const asyncHandler = require('../middlewares/async');
const { Product } = require('../models');
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