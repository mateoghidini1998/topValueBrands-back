const { Product, AmazonProductDetail } = require("../models");
const logger = require("../logger/logger");
const asyncHandler = require("../middlewares/async");
const {
  generateInventoryReport,
  getReportStatus,
  downloadReport,
  csvToJson,
} = require("../utils/utils");
const axios = require("axios");
const { FindAmazonProducts } = require("../repositories/product.repository");

const processAmazonListingStatus = async (product, accessToken) => {
  const url = `${process.env.AMZ_BASE_URL}/listings/2021-08-01/items/${process.env.AMAZON_SELLER_ID}/${product.seller_sku}`;
  const params = {
    marketplaceIds: "ATVPDKIKX0DER",
    includedData: ["summaries", "issues", "attributes"].join(","),
  };

  const { data } = await axios.get(url, {
    headers: {
      "Content-Type": "application/json",
      "x-amz-access-token": accessToken,
    },
    params,
  });

  let newStatusId = null;

  const errorCategories = ["QUALIFICATION_REQUIRED", "CATALOG_ITEM_REMOVED"];
  const hasError =
    Array.isArray(data.issues) &&
    data.issues.some((issue) =>
      issue.categories.some((cat) => errorCategories.includes(cat))
    );

  if (hasError) {
    newStatusId = 3;
  } else if (Array.isArray(data.summaries) && data.summaries.length > 0) {
    const statuses = data.summaries[0].status;
    if (statuses.includes("BUYABLE")) {
      newStatusId = 1;
    } else if (statuses.includes("DISCOVERABLE")) {
      newStatusId = product.warehouse_stock > 0 ? 4 : 2;
    }
  }

  if (newStatusId != null && newStatusId !== product.listing_status_id) {
    const [count] = await Product.update(
      { listing_status_id: newStatusId },
      { where: { id: product.id } }
    );
    if (count === 1) {
      console.log(`Product ${product.seller_sku} updated with status ${newStatusId}`);
      return {
        success: true,
        seller_sku: product.seller_sku,
        updated: {
          old_status: product.listing_status_id,
          new_status: newStatusId,
        },
      };
    }
  }

  return { success: true, seller_sku: product.seller_sku };
};

const GetListingStatus = asyncHandler(async (req, res) => {
  const accessToken = req.headers["x-amz-access-token"];

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      msg: "Access token is required",
    });
  }

  try {
    const AmazonProducts = await FindAmazonProducts();

    if (!AmazonProducts.length) {
      return res.status(404).json({
        success: false,
        msg: "No Amazon products found",
      });
    }

    const results = {
      total: AmazonProducts.length,
      processed: 0,
      errors: [],
      updated: [],
    };

    const BATCH_SIZE = 2;
    for (let i = 0; i < AmazonProducts.length; i += BATCH_SIZE) {
      console.log(`processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(AmazonProducts.length / BATCH_SIZE)}`);
      const batch = AmazonProducts.slice(i, i + BATCH_SIZE);

      // Process batch
      const batchResults = await Promise.all(
        batch.map(async (product) => {
          try {
            const result = await processAmazonListingStatus(
              product,
              accessToken
            );
            if (result.updated) {
              results.updated.push(result.updated);
            }
            results.processed++;
            console.log('listing status ready to update');
            return result;
          } catch (error) {
            console.log('error fetching listing status');
            // console.log(error)
            if (error.response?.status === 429) {
              console.log("Rate limited");
              await new Promise((resolve) => setTimeout(resolve, 2000));
              return {
                success: false,
                seller_sku: product.seller_sku,
                error: "Rate limited",
              };
            }
            // Handle 404 errors by setting status to 5 (TRACKING)
            if (error.response?.status === 404) {
              console.log("Product not found");
              const [count] = await Product.update(
                { listing_status_id: 5 },
                { where: { id: product.id } }
              );
              if (count === 1) {
                results.updated.push({
                  old_status: product.listing_status_id,
                  new_status: 5
                });
              }
              results.processed++;
              return {
                success: true,
                seller_sku: product.seller_sku,
                updated: {
                  old_status: product.listing_status_id,
                  new_status: 5
                }
              };
            }
            results.errors.push({
              seller_sku: product.seller_sku,
              error: error.message,
            });
            results.processed++;
            return {
              success: false,
              seller_sku: product.seller_sku,
              error: error.message,
            };
          }
        })
      );

      // Add a small delay between batches to avoid rate limits
      console.log('waiting 1 second');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return res.status(200).json({
      success: true,
      msg: "Listing status update completed",
      results,
    });
  } catch (error) {
    logger.error("Error in GetListingStatus:", error);
    return res.status(500).json({
      success: false,
      msg: "Error processing listing status updates",
      error: error.message,
    });
  }
});

const syncDBWithAmazon = asyncHandler(async (req, res, next) => {
  logger.info("Starting syncDBWithAmazon process");

  try {
    // 1. Generate and validate inventory report
    const reportId = await generateInventoryReport(req, res, next);
    if (!reportId) {
      throw new Error("Failed to generate inventory report");
    }

    logger.info(`Inventory report generated with ID: ${reportId}`);

    // 2. Wait for report processing with timeout and exponential backoff
    const MAX_RETRIES = 10;
    const INITIAL_RETRY_DELAY = 5000; // 5 seconds
    let reportStatus = null;
    let retryCount = 0;

    while (retryCount < MAX_RETRIES) {
      try {
        reportStatus = await getReportStatus(req, res, next, reportId);

        if (reportStatus === "DONE") {
          break;
        } else if (
          reportStatus === "CANCELLED" ||
          reportStatus === "FAILED"
        ) {
          throw new Error(
            `Report processing failed with status: ${reportStatus}`
          );
        }

        logger.info(
          `Report status: ${reportStatus}, retry ${
            retryCount + 1
          }/${MAX_RETRIES}`
        );

        // Exponential backoff
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
      } catch (error) {
        if (error.response?.status === 429) {
          logger.warn("Rate limit hit, waiting before retry...");
          await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
          continue;
        }
        throw error;
      }
    }

    if (reportStatus !== "DONE") {
      throw new Error(
        `Report processing timed out after ${MAX_RETRIES} retries`
      );
    }

    // 3. Download and process report with validation
    const reportData = await downloadReport(req, res, next, reportId);
    if (!reportData) {
      throw new Error("Failed to download report data");
    }

    // 4. Convert CSV to JSON with validation
    const inventoryData = await csvToJson(reportData);
    if (!inventoryData || !Array.isArray(inventoryData)) {
      throw new Error("Invalid inventory data format");
    }

    // Validate required fields
    const requiredFields = [
      "seller_sku",
      "asin",
      "fnsku",
      "condition",
      "quantity",
      "fulfillment_channel",
    ];
    const invalidItems = inventoryData.filter(
      (item) =>
        !requiredFields.every(
          (field) => item[field] !== undefined && item[field] !== null
        )
    );

    if (invalidItems.length > 0) {
      logger.warn(
        `Found ${invalidItems.length} items with missing required fields`
      );
    }

    logger.info(`Processing ${inventoryData.length} inventory items`);

    // 5. Batch process database updates with transaction
    const BATCH_SIZE = 100;
    const processedItems = [];
    const errors = [];
    const transaction = await sequelize.transaction();

    try {
      for (let i = 0; i < inventoryData.length; i += BATCH_SIZE) {
        const batch = inventoryData.slice(i, i + BATCH_SIZE);
        try {
          const batchResults = await Promise.all(
            batch.map(async (item) => {
              try {
                // Validate item data
                if (!item.seller_sku || !item.asin) {
                  return { error: `Invalid item data: missing SKU or ASIN` };
                }

                const product = await Product.findOne({
                  where: { seller_sku: item.seller_sku },
                  transaction,
                });

                if (!product) {
                  return {
                    error: `Product not found for SKU: ${item.seller_sku}`,
                  };
                }

                const amazonProductDetail = await AmazonProductDetail.findOne(
                  {
                    where: { product_id: product.id },
                    transaction,
                  }
                );

                if (!amazonProductDetail) {
                  return {
                    error: `AmazonProductDetail not found for product: ${product.id}`,
                  };
                }

                // Validate quantity
                const quantity = parseInt(item.quantity, 10);
                if (isNaN(quantity) || quantity < 0) {
                  return {
                    error: `Invalid quantity for SKU ${item.seller_sku}: ${item.quantity}`,
                  };
                }

                await amazonProductDetail.update(
                  {
                    asin: item.asin,
                    fnsku: item.fnsku,
                    condition: item.condition,
                    quantity: quantity,
                    fulfillment_channel: item.fulfillment_channel,
                  },
                  { transaction }
                );

                return { success: true, sku: item.seller_sku };
              } catch (error) {
                return {
                  error: `Error processing item ${item.seller_sku}: ${error.message}`,
                };
              }
            })
          );

          processedItems.push(...batchResults.filter((r) => r.success));
          errors.push(...batchResults.filter((r) => r.error));

          logger.info(
            `Processed batch ${i / BATCH_SIZE + 1} of ${Math.ceil(
              inventoryData.length / BATCH_SIZE
            )}`
          );
        } catch (error) {
          logger.error(`Error processing batch ${i / BATCH_SIZE + 1}:`, {
            error: error.message,
            stack: error.stack,
          });
          errors.push({ error: `Batch processing error: ${error.message}` });
        }
      }

      // Commit transaction if all batches processed successfully
      await transaction.commit();

      // 6. Send response with detailed results
      res.status(200).json({
        success: true,
        message: "Database synchronized successfully",
        stats: {
          totalItems: inventoryData.length,
          processedItems: processedItems.length,
          errorCount: errors.length,
          invalidItems: invalidItems.length,
        },
        errors: errors.length > 0 ? errors : undefined,
      });

      logger.info("syncDBWithAmazon completed successfully", {
        totalItems: inventoryData.length,
        processedItems: processedItems.length,
        errorCount: errors.length,
        invalidItems: invalidItems.length,
      });
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error("Error in syncDBWithAmazon:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stack,
    });
  }
});

module.exports = {
  GetListingStatus,
  syncDBWithAmazon,
};
