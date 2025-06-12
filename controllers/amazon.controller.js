const { Product, AmazonProductDetail } = require("../models");
const logger = require("../logger/logger");
const asyncHandler = require("../middlewares/async");
const { sendCSVasJSON } = require("../utils/utils");
const { fetchNewTokenForFees } = require("../middlewares/lwa_token");
const axios = require("axios");
const { FindAmazonProducts } = require("../repositories/product.repository");
const { sequelize, Op } = require("../models");
const path = require("path");
const fs = require("fs");

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
      console.log(
        `Product ${product.seller_sku} updated with status ${newStatusId}`
      );
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
      console.log(
        `processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(
          AmazonProducts.length / BATCH_SIZE
        )}`
      );
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
            console.log("listing status ready to update");
            return result;
          } catch (error) {
            console.log("error fetching listing status");
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
                  new_status: 5,
                });
              }
              results.processed++;
              return {
                success: true,
                seller_sku: product.seller_sku,
                updated: {
                  old_status: product.listing_status_id,
                  new_status: 5,
                },
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
      console.log("waiting 1 second");
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

const processReport = async (productsArray) => {
  logger.info("Start processReport function");
  const t = await sequelize.transaction();

  try {
    const newProducts = [];
    const updatedProducts = [];
    const productsInReport = new Set();

    // 1) Traer todos los productos con su detalle (LEFT JOIN)
    const allProducts = await Product.findAll({
      include: [
        {
          model: AmazonProductDetail,
          as: "AmazonProductDetail",
        },
      ],
      transaction: t,
    });

    // 2) Construir un Map para búsquedas rápidas por ASIN
    const productMap = new Map();
    for (const prod of allProducts) {
      // puede que AmazonProductDetail sea null
      const detail = prod.AmazonProductDetail;
      if (detail) {
        productMap.set(detail.ASIN, { product: prod, detail });
      } else {
        // marcamos la existencia de prod sin detail
        productMap.set(prod.seller_sku /*o prod.upc segun tu lógica*/, {
          product: prod,
          detail: null,
        });
      }
    }

    // 3) Procesar el arreglo de reporte
    for (const item of productsArray) {
      const asin = item.asin;
      productsInReport.add(asin);

      const entry = productMap.get(asin);

      if (entry && entry.detail) {
        // — Ya existe detalle: actualizar si cambian valores
        const d = entry.detail;
        let needsUpdate = false;

        if (d.FBA_available_inventory !== +item["afn-fulfillable-quantity"]) {
          d.FBA_available_inventory = +item["afn-fulfillable-quantity"];
          needsUpdate = true;
        }
        if (d.reserved_quantity !== +item["afn-reserved-quantity"]) {
          d.reserved_quantity = +item["afn-reserved-quantity"];
          needsUpdate = true;
        }
        if (d.Inbound_to_FBA !== +item["afn-inbound-shipped-quantity"]) {
          d.Inbound_to_FBA = +item["afn-inbound-shipped-quantity"];
          needsUpdate = true;
        }
        if (!d.in_seller_account) {
          d.in_seller_account = true;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await d.save({ transaction: t });
          updatedProducts.push(entry.product);
        }
      } else if (entry && !entry.detail) {
        // — Producto existe pero detalle eliminado: crearlo
        const newDetail = await AmazonProductDetail.create(
          {
            product_id: entry.product.id,
            ASIN: asin,
            FBA_available_inventory: +item["afn-fulfillable-quantity"],
            reserved_quantity: +item["afn-reserved-quantity"],
            Inbound_to_FBA: +item["afn-inbound-shipped-quantity"],
            in_seller_account: true,
          },
          { transaction: t }
        );

        // Adjuntar al objeto para consistencia (opcional)
        entry.product.AmazonProductDetail = newDetail;
        newProducts.push(entry.product);
      } else {
        // — Ni el producto ni el detalle existen: crear ambos
        const newProduct = await Product.create(
          {
            product_name: item["product-name"],
            seller_sku: item.sku,
            in_seller_account: true,
          },
          { transaction: t }
        );

        const newDetail = await AmazonProductDetail.create(
          {
            product_id: newProduct.id,
            ASIN: asin,
            FBA_available_inventory: +item["afn-fulfillable-quantity"],
            reserved_quantity: +item["afn-reserved-quantity"],
            Inbound_to_FBA: +item["afn-inbound-shipped-quantity"],
            in_seller_account: true,
          },
          { transaction: t }
        );

        newProduct.AmazonProductDetail = newDetail;
        newProducts.push(newProduct);
      }
    }

    // 4) Marcar como fuera de cuenta los detalles que ya no vienen en el reporte
    for (const [asin, { detail }] of productMap) {
      if (detail && !productsInReport.has(asin) && detail.in_seller_account) {
        detail.in_seller_account = false;
        detail.FBA_available_inventory = 0;
        detail.reserved_quantity = 0;
        detail.Inbound_to_FBA = 0;
        await detail.save({ transaction: t });
    
        const prod =
          detail.Product || (await detail.getProduct({ transaction: t }));
        updatedProducts.push(prod);
      }
    }
    

    await t.commit();
    logger.info("Finish processReport function");

    return {
      newSyncProductsQuantity: newProducts.length,
      newSyncQuantity: updatedProducts.length,
      newSyncProducts: newProducts,
      newSyncData: updatedProducts,
    };
  } catch (error) {
    await t.rollback();
    logger.error("Error al actualizar o crear productos:", error);
    throw error;
  }
};

const syncDBWithAmazon = asyncHandler(async (req, res, next) => {
  logger.info("fetching new token for sync db with amazon...");
  let accessToken = await fetchNewTokenForFees();
  console.log(accessToken);

  try {
    if (!accessToken) {
      logger.info("fetching new token for sync db with amazon...");
      accessToken = await fetchNewTokenForFees();
      req.headers["x-amz-access-token"] = accessToken;
    } else {
      logger.info("Token is still valid...");
    }

    // Call createReport and get the reportId
    const report = await sendCSVasJSON(req, res, next);
    logger.info("Finish creating report");
    const newSync = await processReport(report);
/*     const imageSyncResult = await addImageToNewProducts(accessToken);
 */
    res.json({ newSync });
    return { newSync };
  } catch (error) {
    next(error);
  }
});

module.exports = {
  GetListingStatus,
  syncDBWithAmazon,
};
