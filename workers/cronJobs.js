const { parentPort, workerData } = require("worker_threads");
const { syncDBWithAmazon } = require("../controllers/amazon.controller");
const { generateTrackedProductsData } = require("../controllers/trackedproducts.controller");
const logger = require("../logger/logger");
const moment = require("moment");

class CronJobManager {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.metrics = {
      startTime: null,
      endTime: null,
      success: false,
      errors: [],
      itemsProcessed: 0,
      apiCalls: 0,
      retries: 0,
      rateLimitHits: 0
    };
    this.rateLimiter = {
      lastCall: null,
      minInterval: 500, // Minimum time between API calls in ms
      maxRetries: 3
    };
  }

  async execute() {
    if (this.isRunning) {
      logger.warn("Cron job is already running");
      return;
    }

    this.isRunning = true;
    this.metrics = {
      startTime: new Date(),
      endTime: null,
      success: false,
      errors: [],
      itemsProcessed: 0,
      apiCalls: 0,
      retries: 0,
      rateLimitHits: 0
    };

    try {
      if (!workerData?.accessToken) {
        throw new Error("No valid access token received in worker");
      }

      const today = moment().format("YYYY-MM-DDTHH:mm:ssZ");
      const todayMinus30Days = moment().subtract(30, "days").format("YYYY-MM-DDTHH:mm:ssZ");

      // Prepare request objects with rate limiting
      const reqProducts = await this.prepareRequestWithRateLimit(
        "GET_FBA_MYI_ALL_INVENTORY_DATA",
        workerData.accessToken
      );
      const reqOrders = await this.prepareRequestWithRateLimit(
        "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL",
        workerData.accessToken,
        { dataStartTime: todayMinus30Days, dataEndTime: today }
      );

      // Execute jobs in parallel with improved error handling
      const [syncResult, trackedResult] = await Promise.allSettled([
        this.executeWithRetry(() => syncDBWithAmazon(reqProducts, this.createResponseHandler(), this.createErrorHandler())),
        this.executeWithRetry(() => generateTrackedProductsData(reqOrders, this.createResponseHandler(), this.createErrorHandler()))
      ]);

      // Process results
      this.processResults(syncResult, trackedResult);

      // Send success message
      parentPort.postMessage({
        type: "success",
        message: "Amazon sync job completed successfully",
        metrics: this.metrics
      });

    } catch (error) {
      this.handleError(error);
    } finally {
      this.cleanup();
    }
  }

  async prepareRequestWithRateLimit(reportType, accessToken, additionalParams = {}) {
    await this.enforceRateLimit();
    this.metrics.apiCalls++;
    
    return {
      body: {
        reportType,
        marketplaceIds: [process.env.MARKETPLACE_US_ID],
        ...additionalParams
      },
      headers: {
        "x-amz-access-token": accessToken
      }
    };
  }

  async enforceRateLimit() {
    if (this.rateLimiter.lastCall) {
      const timeSinceLastCall = Date.now() - this.rateLimiter.lastCall;
      if (timeSinceLastCall < this.rateLimiter.minInterval) {
        await new Promise(resolve => 
          setTimeout(resolve, this.rateLimiter.minInterval - timeSinceLastCall)
        );
      }
    }
    this.rateLimiter.lastCall = Date.now();
  }

  createResponseHandler() {
    return {
      status: (code) => {
        logger.info(`Response status code: ${code}`);
        return this.createResponseHandler();
      },
      json: (data) => {
        logger.info(`Response data: ${JSON.stringify(data)}`);
        return this.createResponseHandler();
      }
    };
  }

  createErrorHandler() {
    return (err) => {
      if (err) {
        logger.error(`Error in controller: ${err.message}`);
        this.metrics.errors.push(err.message);
        throw err;
      }
    };
  }

  async executeWithRetry(operation, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        this.metrics.retries = i;
        return await operation();
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${i + 1} failed: ${error.message}`);
        
        if (error.response?.status === 429) {
          this.metrics.rateLimitHits++;
          await this.handleRateLimit();
        }
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    throw lastError;
  }

  async handleRateLimit() {
    const backoffTime = 5000; // 5 seconds
    logger.warn(`Rate limit hit. Waiting ${backoffTime}ms before retry...`);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
  }

  processResults(syncResult, trackedResult) {
    if (syncResult.status === 'fulfilled') {
      this.metrics.itemsProcessed += syncResult.value?.itemsProcessed || 0;
    } else {
      this.metrics.errors.push(`Sync failed: ${syncResult.reason?.message}`);
    }

    if (trackedResult.status === 'fulfilled') {
      this.metrics.itemsProcessed += trackedResult.value?.itemsProcessed || 0;
    } else {
      this.metrics.errors.push(`Tracked data failed: ${trackedResult.reason?.message}`);
    }

    this.metrics.success = this.metrics.errors.length === 0;
  }

  handleError(error) {
    logger.error("Error in Amazon sync job:", error);
    this.metrics.errors.push(error.message);
    parentPort.postMessage({
      type: "error",
      message: error.message,
      metrics: this.metrics
    });
  }

  cleanup() {
    this.isRunning = false;
    this.metrics.endTime = new Date();
    this.lastRun = new Date();
    
    // Log final metrics
    logger.info("Cron job completed", {
      duration: this.metrics.endTime - this.metrics.startTime,
      success: this.metrics.success,
      itemsProcessed: this.metrics.itemsProcessed,
      errors: this.metrics.errors.length,
      apiCalls: this.metrics.apiCalls,
      retries: this.metrics.retries,
      rateLimitHits: this.metrics.rateLimitHits
    });
  }
}

// Execute the cron job
const manager = new CronJobManager();
manager.execute(); 