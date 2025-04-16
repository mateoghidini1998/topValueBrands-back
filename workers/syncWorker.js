const { parentPort, workerData, isMainThread } = require('worker_threads');
const { syncDBWithAmazon } = require('../controllers/reports.controller');
const { generateTrackedProductsData } = require('../controllers/trackedproducts.controller');
const logger = require('../logger/logger');
const { updateDangerousGoodsFromReport, updateSupressedListings } = require('../utils/utils');
const moment = require('moment');

(async () => {
  try {
    logger.info("Worker: Starting shipment tracking job...");
    logger.info(`Is in main thread? ${isMainThread}`);

    if (!workerData || !workerData.accessToken) {
      throw new Error("No valid access token received in worker.");
    }

    // const dataStartTime = moment().utc().subtract(1, 'months').startOf('month').format("YYYY-MM-DDTHH:mm:ssZ");
    // const dataEndTime = moment().utc().subtract(1, 'months').endOf('month').format("YYYY-MM-DDTHH:mm:ssZ");

    const yesterday = moment().subtract(1, 'days').format("YYYY-MM-DDTHH:mm:ssZ");
    const yesterdayMinus30Days = moment().subtract(30, 'days').format("YYYY-MM-DDTHH:mm:ssZ");

    const reqProducts = {
      body: {
        reportType: 'GET_FBA_MYI_ALL_INVENTORY_DATA',
        marketplaceIds: [process.env.MARKETPLACE_US_ID],
      },
      headers: {
        "x-amz-access-token": workerData.accessToken,
      },
    };
    const reqOrders = {
      body: {
        reportType: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
        marketplaceIds: [process.env.MARKETPLACE_US_ID],
        dataStartTime: yesterdayMinus30Days,
        dataEndTime: yesterday,
      },
      headers: {
        "x-amz-access-token": workerData.accessToken,
      },
    };
    const reqDGItems = {
      body: {
        reportType: 'GET_FBA_STORAGE_FEE_CHARGES_DATA',
        marketplaceIds: [process.env.MARKETPLACE_US_ID],
        dataStartTime: "2025-03-01T00:00:00Z",
        dataEndTime: "2025-03-31T00:00:00Z",
        custom: true,
      },
      headers: {
        "x-amz-access-token": workerData.accessToken,
      },
    };
    const reqSupressedListings = {
      body: {
        reportType: 'GET_MERCHANTS_LISTINGS_FYP_REPORT',
        marketplaceIds: [process.env.MARKETPLACE_US_ID],
      },
      headers: {
        "x-amz-access-token": workerData.accessToken,
      },
    };
    const res = {
      status: (code) => {
        logger.info(`Worker: Response status code: ${code}`);
        return res;
      },
      json: (data) => {
        logger.info(`Worker: Response data: ${JSON.stringify(data)}`);
        return res;
      },
    };
    const next = (err) => {
      if (err) {
        logger.error(`Worker: Error in controller: ${err.message}`);
        throw err;
      }
    };



    // await updateDangerousGoodsFromReport(reqDGItems, res, next);
    await updateSupressedListings(reqSupressedListings, res, next);
    await syncDBWithAmazon(reqProducts, res, next);
    await generateTrackedProductsData(reqOrders, res, next);

    parentPort.postMessage('Worker: Amazon sync job completed successfully');
  } catch (error) {
    logger.error('Worker: Error in Amazon sync job:', error);
    parentPort.postMessage({ error: error.message });
  }
})();