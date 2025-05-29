const { parentPort, workerData, isMainThread } = require("worker_threads");
const { syncDBWithAmazon } = require("../controllers/amazon.controller");
const {
  generateTrackedProductsData,
} = require("../controllers/trackedproducts.controller");
const logger = require("../logger/logger");
const {
  updateBreakdownForReservedInventory,
} = require("../utils/utils");
const moment = require("moment");

(async () => {
  try {
    logger.info("Worker: Starting shipment tracking job...");
    logger.info(`Is in main thread? ${isMainThread}`);

    if (!workerData || !workerData.accessToken) {
      throw new Error("No valid access token received in worker.");
    }

    const ZONE = "America/New_York";

    const today = moment().tz(ZONE).startOf("day");
    const todayMinus30Days = moment()
      .tz(ZONE)
      .subtract(30, "days")
      .startOf("day");

    const reqProducts = {
      body: {
        reportType: "GET_FBA_MYI_ALL_INVENTORY_DATA",
        marketplaceIds: [process.env.MARKETPLACE_US_ID],
      },
      headers: {
        "x-amz-access-token": workerData.accessToken,
      },
    };

    const reqOrders = {
      body: {
        reportType: "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL",
        marketplaceIds: [process.env.MARKETPLACE_US_ID],
        dataStartTime: todayMinus30Days,
        dataEndTime: today,
      },
      headers: {
        "x-amz-access-token": workerData.accessToken,
      },
    };
    const reqListingsData = {
      body: {
        reportType: "GET_MERCHANT_LISTINGS_ALL_DATA",
        marketplaceIds: [process.env.MARKETPLACE_US_ID],
      },
      headers: {
        "x-amz-access-token": workerData.accessToken,
      },
    };
    const reqBreakdownData = {
      body: {
        reportType: "GET_RESTOCK_INVENTORY_RECOMMENDATIONS_REPORT",
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
    await updateBreakdownForReservedInventory(reqBreakdownData, res, next);
    await syncDBWithAmazon(reqProducts, res, next);
    await generateTrackedProductsData(reqOrders, res, next);

    parentPort.postMessage("Worker: Amazon sync job completed successfully");
  } catch (error) {
    logger.error("Worker: Error in Amazon sync job:", error);
    parentPort.postMessage({ error: error.message });
  }
})();
