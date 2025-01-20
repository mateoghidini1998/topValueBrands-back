const { isMainThread, parentPort, workerData } = require('worker_threads');
const { getShipmentTracking } = require('../controllers/outgoingshipments.controller');
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

    await getShipmentTracking(req, res);

    parentPort.postMessage("Worker: Shipment tracking job completed successfully");
  } catch (error) {
    logger.error("Worker: Error in shipment tracking job:", error.message);
    parentPort.postMessage({ error: error.message });
  }
})();
