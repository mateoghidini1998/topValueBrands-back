const { parentPort, workerData, isMainThread } = require('worker_threads');
const { syncDBWithAmazon } = require('../controllers/reports.controller');
const { generateTrackedProductsData } = require('../controllers/trackedproducts.controller');
const logger = require('../logger/logger');

(async () => {
    try {
        logger.info("Worker: Starting shipment tracking job...");
    logger.info(`Is in main thread? ${isMainThread}`);

    if (!workerData || !workerData.accessToken) {
      throw new Error("No valid access token received in worker.");
    }

    const req = {
      headers: {
        "x-amz-access-token": workerData.accessToken, 
      },
    };
    console.log("Request headers:", req.headers);

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

        await syncDBWithAmazon(req, res, next);
        await generateTrackedProductsData(req, res, next);

        parentPort.postMessage('Worker: Amazon sync job completed successfully');
    } catch (error) {
        logger.error('Worker: Error in Amazon sync job:', error);
        parentPort.postMessage({ error: error.message });
    }
})();