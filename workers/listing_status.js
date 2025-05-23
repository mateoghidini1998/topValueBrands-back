const { parentPort, workerData, isMainThread } = require("worker_threads");
const logger = require("../logger/logger");
const { GetListingStatus } = require("../controllers/amazon.controller");

(async () => {
  try {
    logger.info("Worker: Listing status update job...");
    logger.info(`Is in main thread? ${isMainThread}`);

    if (!workerData || !workerData.accessToken) {
      throw new Error("No valid access token received in worker.");
    }

    const req = {
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

    await GetListingStatus(req, res, next);

    if (parentPort) {
      parentPort.postMessage(
        "Worker: Listing status update job completed successfully"
      );
    }
    return "Worker: Listing status update job completed successfully";
  } catch (error) {
    logger.error("Worker: Error in Listing status update job:", error);
    if (parentPort) {
      parentPort.postMessage({ error: error.message });
    }
    throw error;
  }
})();

