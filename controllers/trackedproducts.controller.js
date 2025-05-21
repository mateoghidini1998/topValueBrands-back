const {
  LIMIT_PRODUCTS,
  OFFSET_PRODUCTS,
  ASINS_PER_GROUP,
  BATCH_SIZE_FEES,
  MS_DELAY_FEES,
  MAX_RETRIES,
} = require("../utils/constants/constants");
const {
  AmazonProductDetail,
  Product,
  TrackedProduct,
  Supplier,
  PurchaseOrderProduct,
} = require("../models");
const axios = require("axios");
const asyncHandler = require("../middlewares/async");
const { generateOrderReport } = require("../utils/utils");
const dotenv = require("dotenv");
const logger = require("../logger/logger");
const { Op, literal } = require("sequelize");
const { fetchNewTokenForFees } = require("../middlewares/lwa_token");
const { generateMockTrackedDataForProducts } = require("../utils/mock_data");

dotenv.config({ path: "./.env" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchProducts = async ({ limit = LIMIT_PRODUCTS, offset = OFFSET_PRODUCTS } = {}) => {
  const products = await Product.findAll({
    limit,
    offset,
    include: [
      {
        model: AmazonProductDetail,
        as: "AmazonProductDetail",
        attributes: ["ASIN"],
      },
    ],
  });
  console.log(products)
  return products;
};


//@route GET api/v1/pogenerator/trackedproducts
//@desc  Get all tracked products
//@access Private
exports.getTrackedProducts = asyncHandler(async (req, res) => {
  logger.info("Executing getTrackedProducts...");

  const page = parseInt(req.query.page) || 1;
  const limit = 10000;
  const offset = (page - 1) * limit;
  const keyword = req.query.keyword || "";
  const supplier_id = req.query.supplier || null;
  const orderBy = req.query.orderBy || "updatedAt";
  const orderWay = req.query.orderWay || "ASC";

  const whereConditions = {
    is_active: true,
  };

  const includeProduct = {
    model: Product,
    as: "product",
    attributes: [
      "id",
      "product_name",
      "product_cost",
      "product_image",
      "supplier_id",
      "in_seller_account",
      "supplier_item_number",
      "warehouse_stock",
      "pack_type",
      "upc",
      "seller_sku",
    ],
    include: [
      {
        model: AmazonProductDetail,
        as: "AmazonProductDetail",
        attributes: [
          "ASIN",
          "FBA_available_inventory",
          "reserved_quantity",
          "Inbound_to_FBA",
          "dangerous_goods",
        ],
        required: false,
      },
      {
        model: Supplier,
        as: "supplier",
        attributes: ["supplier_name"],
        required: false,
      },
    ],
    where: {},
    required: true,
  };

  if (keyword) {
    includeProduct.where[Op.or] = [
      { product_name: { [Op.like]: `%${keyword}%` } },
      { "$product.AmazonProductDetail.ASIN$": { [Op.like]: `%${keyword}%` } },
      {
        "$product.seller_sku$": {
          [Op.like]: `%${keyword}%`,
        },
      },
    ];
  }

  if (supplier_id) {
    includeProduct.where.supplier_id = {
      [Op.eq]: supplier_id,
      [Op.ne]: null,
    };
  }

  const isProductField = [
    "product_cost",
    "product_name",
    "ASIN",
    "seller_sku",
  ].includes(orderBy);
  const order = isProductField
    ? [[literal(`product.${orderBy}`), orderWay]]
    : [[orderBy, orderWay]];

  try {
    const trackedProducts = await TrackedProduct.findAndCountAll({
      offset,
      limit,
      order,
      where: whereConditions,
      include: [includeProduct],
      distinct: true,
      subQuery: false,
    });

    const totalPages = Math.ceil(trackedProducts.length / limit);

    res.status(200).json({
      success: true,
      total: trackedProducts.length,
      pages: totalPages,
      currentPage: page,
      data: trackedProducts.rows.map((p) => {
        const product = p.product;
        const amazonDetail = product?.AmazonProductDetail;
        const supplier = product?.supplier;

        return {
          id: p.id,
          product_id: p.product_id,
          current_rank: p.current_rank,
          thirty_days_rank: p.thirty_days_rank,
          ninety_days_rank: p.ninety_days_rank,
          units_sold: p.units_sold,
          product_velocity: p.product_velocity,
          product_velocity_2: p.product_velocity_2,
          product_velocity_7: p.product_velocity_7,
          product_velocity_15: p.product_velocity_15,
          product_velocity_60: p.product_velocity_60,
          avg_selling_price: p.avg_selling_price,
          lowest_fba_price: p.lowest_fba_price,
          fees: p.fees,
          profit: p.profit,
          is_active: p.is_active,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          roi: (p.profit / product.product_cost) * 100 || null,

          product_name: product.product_name,
          product_cost: product.product_cost,
          product_image: product.product_image,
          supplier_id: product.supplier_id,
          in_seller_account: product.in_seller_account,
          supplier_item_number: product.supplier_item_number,
          warehouse_stock: product.warehouse_stock,
          upc: product.upc,
          pack_type: product.pack_type,
          seller_sku: product.seller_sku,

          ASIN: amazonDetail?.ASIN ?? null,
          FBA_available_inventory:
            amazonDetail?.FBA_available_inventory ?? null,
          reserved_quantity: amazonDetail?.reserved_quantity ?? null,
          Inbound_to_FBA: amazonDetail?.Inbound_to_FBA ?? null,
          dangerous_goods: amazonDetail?.dangerous_goods ?? null,

          supplier_name: supplier?.supplier_name ?? null,
        };
      }),
    });

    logger.info("Tracked products sent successfully");
  } catch (error) {
    logger.error("There was an error while obtaining tracked products", {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: "There was an error while obtaining tracked products",
    });
  }
});

exports.getTrackedProductsFromAnOrder = asyncHandler(async (req, res) => {
  const products = await PurchaseOrderProduct.findAll({
    where: { purchase_order_id: req.params.id },
  });

  if (!products || products.length === 0) {
    return res.status(404).json({ message: "Products not found" });
  }

  const productIds = products.map((product) => product.product_id);

  const trackedProducts = await TrackedProduct.findAll({
    where: { product_id: productIds },
    include: [
      {
        model: Product,
        as: "product",
        attributes: [
          "product_name",
          "product_image",
          "product_cost",
          "in_seller_account",
          "supplier_id",
          'seller_sku',
        ],
        include: [
          {
            model: AmazonProductDetail,
            as: "AmazonProductDetail",
            attributes: ["ASIN"],
          },
          {
            model: Supplier,
            as: "supplier",
            attributes: ["supplier_name"],
          },
        ],
      },
    ],
  });

  if (!trackedProducts || trackedProducts.length === 0) {
    return res.status(404).json({ message: "Tracked products not found" });
  }

  const transformed = trackedProducts.map((tp) => {
    const { product, ...tpData } = tp.toJSON();
    const { AmazonProductDetail, supplier, ...productData } = product;

    return {
      ...tpData,
      product_name: productData.product_name,
      product_image: productData.product_image,
      product_cost: productData.product_cost,
      in_seller_account: productData.in_seller_account,
      seller_sku: productData?.seller_sku || null,
      supplier_name: supplier?.supplier_name || null,
      ASIN: AmazonProductDetail?.ASIN || null,
    };
  });

  return res.status(200).json({
    success: true,
    data: transformed,
  });
});

exports.generateTrackedProductsData = asyncHandler(async (req, res, next) => {
  logger.info("Start generateTrackedProductsData");

  try {
    const products = await fetchProducts({
      limit: 100,
      offset: 0,
    });

    if (!products || products.length === 0) {
      throw new Error("No products found to process");
    }

    const productsWithASIN = products
      .filter(p => p.AmazonProductDetail && typeof p.AmazonProductDetail.ASIN === "string")
      .map(p => ({
        ...p.get({ plain: true }),
        ASIN: p.AmazonProductDetail.ASIN,
        seller_sku: p.seller_sku,
      }));

    if (productsWithASIN.length === 0) {
      throw new Error("No products with valid ASIN found");
    }

    logger.info(`Processing ${productsWithASIN.length} products with valid ASIN`);

    const [orderData, keepaData] = await Promise.all([
      saveOrders(req, res, next, productsWithASIN).catch(error => {
        logger.error("saveOrders failed", {
          error: error.message,
          stack: error.stack,
        });
        throw new Error(`saveOrders failed: ${error.message}`);
      }),
      getProductsTrackedData(productsWithASIN).catch(error => {
        logger.error("getProductsTrackedData failed", {
          error: error.message,
          stack: error.stack,
        });
        throw new Error(`getProductsTrackedData failed: ${error.message}`);
      }),
    ]);

    logger.info("Successfully fetched order data and keepa data");

    const combinedData = keepaData.map(keepaItem => {
      const orderItem = orderData.find(o => o.product_id === keepaItem.product_id) || {};
      const unitsSold = orderItem.quantity || 0;
      const productVelocity = orderItem.velocity || 0;
      const lowestFbaPriceInDollars = keepaItem.lowestFbaPrice
        ? keepaItem.lowestFbaPrice / 100
        : null;

      return {
        product_id: keepaItem.product_id,
        current_rank: keepaItem.currentSalesRank || null,
        thirty_days_rank: keepaItem.avg30 || null,
        ninety_days_rank: keepaItem.avg90 || null,
        units_sold: unitsSold,
        product_velocity: productVelocity,
        product_velocity_2: orderItem.velocity_2_days || 0,
        product_velocity_7: orderItem.velocity_7_days || 0,
        product_velocity_15: orderItem.velocity_15_days || 0,
        product_velocity_30: orderItem.velocity_30_days || 0,
        product_velocity_60: orderItem.velocity_60_days || 0,
        avg_selling_price: orderItem.avg_selling_price || null,
        lowest_fba_price: lowestFbaPriceInDollars,
      };
    });

    const BATCH_SIZE = 50;
    for (let i = 0; i < combinedData.length; i += BATCH_SIZE) {
      const batch = combinedData.slice(i, i + BATCH_SIZE);
      await TrackedProduct.bulkCreate(batch, {
        updateOnDuplicate: [
          "current_rank",
          "thirty_days_rank",
          "ninety_days_rank",
          "units_sold",
          "product_velocity",
          "product_velocity_2",
          "product_velocity_7",
          "product_velocity_15",
          "product_velocity_60",
          "avg_selling_price",
          "lowest_fba_price",
        ],
      });
      logger.info(`Processed batch ${i / BATCH_SIZE + 1} of ${Math.ceil(combinedData.length / BATCH_SIZE)}`);
    }

    const trackedProductIds = combinedData.map(item => item.product_id);
    const relatedProducts = await Product.findAll({
      where: { id: trackedProductIds },
    });

    logger.info(`Processing fees for ${relatedProducts.length} products`);

    for (let i = 0; i < relatedProducts.length; i += BATCH_SIZE_FEES) {
      const productBatch = relatedProducts.slice(i, i + BATCH_SIZE_FEES);
      logger.info(
        `Processing fees batch ${i / BATCH_SIZE_FEES + 1} of ${Math.ceil(relatedProducts.length / BATCH_SIZE_FEES)}`
      );
      await delay(MS_DELAY_FEES);
      await addAccessTokenAndProcessBatch(
        req,
        res,
        productBatch,
        combinedData,
        BATCH_SIZE_FEES,
        i / BATCH_SIZE_FEES
      );
    }

    logger.info("All batches processed successfully");

    res.status(200).json({
      message: "Data combined and saved successfully.",
      success: true,
      itemsQuantity: combinedData.length,
    });

  } catch (error) {
    logger.error("Error in generateTrackedProductsData:", {
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

const getProductsTrackedData = async (products) => {
  if (
    process.env.MOCK_KEEPA_DATA === "true" ||
    process.env.MOCK_KEEPA_DATA === true
  ) {
    console.warn(
      "⚠️ MOCKED getProductsTrackedData: No Keepa API calls will be made."
    );
    return generateMockTrackedDataForProducts(products);
  } else {
    logger.info(
      `Starting getProductsTrackedData with ${products.length} products`
    );
    logger.info(
      `Groups of ${ASINS_PER_GROUP} ASINs will be processed in batches of ${ASINS_PER_GROUP} products`
    );

    const uniqueProductsMap = products.reduce((acc, product) => {
      if (!acc[product.ASIN]) {
        acc[product.ASIN] = [];
      }
      acc[product.ASIN].push(product);
      return acc;
    }, {});

    const uniqueASINs = Object.keys(uniqueProductsMap);
    const asinGroups = [];
    for (let i = 0; i < uniqueASINs.length; i += ASINS_PER_GROUP) {
      const group = uniqueASINs.slice(i, i + ASINS_PER_GROUP).join(",");
      asinGroups.push(group);
    }

    logger.info(`Total ASIN groups to process: ${asinGroups.length}`);

    const keepaResponses = [];
    const TOKENS_PER_MIN = 70;
    const REQUIRED_TOKENS = 500;
    let tokensLeft = 4200;
    let totalTokensConsumed = 0;

    for (const [index, asinGroup] of asinGroups.entries()) {
      try {
        logger.info(`Processing group ${index + 1}/${asinGroups.length}`);

        const missingTokens = REQUIRED_TOKENS - tokensLeft;
        logger.info(`tokens consumed: ${totalTokensConsumed}`);
        logger.info(`tokens left: ${tokensLeft}`);
        logger.info(`tokens refill rate: ${TOKENS_PER_MIN}`);

        if (missingTokens <= 0) {
          const keepaDataResponse = await getKeepaData(asinGroup);
          logger.info(
            `getKeepaData raw response for group ${index + 1}: ${JSON.stringify(
              keepaDataResponse
            )}`
          ); 
          keepaResponses.push(keepaDataResponse);
          tokensLeft = keepaDataResponse.tokensLeft;
          totalTokensConsumed += keepaDataResponse.tokensConsumed;
          logger.info(
            `getKeepaData succeeded for group ${index + 1}: [ ${asinGroup} ]`
          );
        } else {
          const waitTimeForTokens =
            Math.ceil(missingTokens / TOKENS_PER_MIN) * 60000;
          logger.info(
            `Waiting ${waitTimeForTokens} ms to accumulate enough tokens`
          );
          await delay(waitTimeForTokens);

          const keepaDataResponse = await getKeepaData(asinGroup);
          tokensLeft = keepaDataResponse.tokensLeft;
          totalTokensConsumed += keepaDataResponse.tokensConsumed;
          keepaResponses.push(keepaDataResponse);

          logger.info(
            `getKeepaData succeeded for group ${index + 1}: [ ${asinGroup} ]`
          );
        }
      } catch (error) {
        logger.error(
          `getKeepaData failed for group ${index + 1}. Group: ${asinGroup}: ${error.message
          }`
        );
      }

      if (tokensLeft <= REQUIRED_TOKENS && index + 1 !== asinGroups.length) {
        logger.info(
          `Waiting ${(REQUIRED_TOKENS / TOKENS_PER_MIN) * 60000
          } ms to refill tokens`
        );
        await delay(Math.ceil(REQUIRED_TOKENS / TOKENS_PER_MIN) * 60000);
      }
    }

    const processedData = keepaResponses.flatMap((response, idx) => {
      if (!response || !response.products) {
        logger.error(
          `Invalid Keepa response at index ${idx}: ${JSON.stringify(response)}`
        );
        return [];
      }

      return response.products.flatMap((product) => {
        const matchingProducts = uniqueProductsMap[product.asin];
        const lowestPrice =
          product.stats.current[10] > 0
            ? product.stats.current[10]
            : product.stats.current[7] > 0
              ? product.stats.current[7]
              : product.stats.buyBoxPrice;

        return matchingProducts.map((matchingProduct) => ({
          product_id: matchingProduct.id,
          currentSalesRank: product.stats.current[3],
          avg30: product.stats.avg30[3],
          avg90: product.stats.avg90[3],
          lowestFbaPrice: lowestPrice,
        }));
      });
    });

    return processedData;
  }
};

const getKeepaData = async (asinGroup, retryCount = 0) => {
  logger.info(`Executing getKeepaData with ASIN group`);
  const apiKey = process.env.KEEPA_API_KEY;
  const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1&offers=20&history=0`;

  logger.info(`Requesting Keepa data: ${url}`);
  try {
    const response = await axios.get(url);
    if (!response.data) {
      throw new Error("No data received from Keepa");
    }
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const waitTime = retryCount === MAX_RETRIES - 1 ? 60000 : 5000;
        logger.error(
          `429 Error: Retry ${retryCount + 1
          }/${MAX_RETRIES}. Waiting for ${waitTime} ms before retry.`
        );
        await delay(waitTime);
        return getKeepaData(asinGroup, retryCount + 1);
      } else {
        throw new Error(
          `Failed after ${MAX_RETRIES} retries: ${error.message}`
        );
      }
    } else {
      throw error;
    }
  }
};

const saveOrders = async (req, res, next, products) => {
  console.log("Executing saveOrders...");
  logger.info("Executing saveOrders...");

  const jsonData = await generateOrderReport(req, res, next);

  if (!jsonData) {
    logger.error("Generating order report failed");
    throw new Error("Failed to retrieve orders");
  }

  const filteredOrders = jsonData.filter(
    (item) =>
      (item["order-status"] === "Shipped" || item["order-status"] === "Pending") && item["sales-channel"] == "Amazon.com"
  );

  const skuQuantities = {};
  const now = new Date();

  filteredOrders.forEach((item) => {
    const { sku, quantity, asin } = item;
    const qty = parseInt(quantity, 10);
    const purchaseDate = new Date(item["purchase-date"]);
    const diffDays = Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24));
    const price = parseFloat(item["item-price"]) || 0;

    if (!skuQuantities[sku]) {
      skuQuantities[sku] = {
        asin,
        total: 0,
        last2: 0,
        last7: 0,
        last15: 0,
        last30: 0,
        totalPrice: 0,
        totalQty: 0,
      };
    }

    skuQuantities[sku].total += qty;
    skuQuantities[sku].totalPrice += price * qty;
    skuQuantities[sku].totalQty += qty;

    if (diffDays <= 30) skuQuantities[sku].last30 += qty;
    if (diffDays <= 15) skuQuantities[sku].last15 += qty;
    if (diffDays <= 7) skuQuantities[sku].last7 += qty;
    if (diffDays <= 2) skuQuantities[sku].last2 += qty;
  });

  const asinToProductId = products.reduce((acc, product) => {
    if (!acc[product.ASIN]) {
      acc[product.ASIN] = [];
    }
    acc[product.ASIN].push(product.id);
    return acc;
  }, {});

  const finalJson = Object.entries(skuQuantities).flatMap(([sku, data]) => {
    const { asin, last2, last7, last15, last30, totalPrice, totalQty } = data;
    const avg_selling_price = totalQty > 0 ? totalPrice / totalQty : 0;

    return (asinToProductId[asin] || []).map((productId) => ({
      sku,
      product_id: productId,
      quantity: data.total,
      velocity: data.total / 30,
      velocity_2_days: last2 / 2,
      velocity_7_days: last7 / 7,
      velocity_15_days: last15 / 15,
      velocity_30_days: last30 / 30,
      avg_selling_price: parseFloat(avg_selling_price.toFixed(2)),
    }));
  });

  return finalJson;
};

const getEstimateFees = async (req, res, next, products) => {
  let accessToken = req.headers["x-amz-access-token"];
  const feeEstimate = [];

  try {
    for (let i = 0; i < products.length; i += 2) {
      try {
        await delay(2100);
        feeEstimate.push(
          await estimateFeesForProduct(products[i], accessToken)
        );
        feeEstimate.push(
          await estimateFeesForProduct(products[i + 1], accessToken)
        );
      } catch (error) {
        logger.error(
          `Error in estimateFeesForProduct for product id ${products[i].id}: ${error.message}`
        );
      }
    }

    return feeEstimate;
  } catch (err) {
    logger.error(`Unexpected error in getEstimateFees: ${err.message}`);
    next(err);
  }
};

const estimateFeesForProduct = async (product, accessToken) => {
  const url = `https://sellingpartnerapi-na.amazon.com/products/fees/v0/items/${product.ASIN}/feesEstimate`;
  const trackedProduct = await TrackedProduct.findOne({
    where: { product_id: product.id },
  });

  if (!trackedProduct) {
    throw new Error(`TrackedProduct not found for product id ${product.id}`);
  }

  const body = {
    FeesEstimateRequest: {
      MarketplaceId: "ATVPDKIKX0DER",
      IsAmazonFulfilled: true,
      Identifier: product.ASIN,
      PriceToEstimateFees: {
        ListingPrice: {
          Amount: trackedProduct.lowest_fba_price.toString(),
          CurrencyCode: "USD",
        },
      },
    },
  };

  try {
    const response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": accessToken,
      },
    });

    const feesEstimate =
      response.data?.payload?.FeesEstimateResult?.FeesEstimate
        ?.TotalFeesEstimate?.Amount || null;

    logger.info(`Fees estimated for product id ${product.id}`);

    return {
      product_id: product.id,
      fees: feesEstimate,
    };
  } catch (error) {
    logger.error(
      `Error estimating fees for product id ${product.id}. ${error.message}`
    );

    if (error.response && error.response.status === 403) {
      logger.info(
        `Error 403 for product id ${product.id} and refreshing access token...`
      );
      accessToken = await getNewAccessToken();
      return estimateFeesForProduct(product, accessToken);
    }

    if (error.response && error.response.status === 429) {
      logger.info(`Error 429 for product id ${product.id}`);
    } else if (error.response && error.response.status === 400) {
      logger.info(`Error 400 for product id ${product.id}`);
    } else if (error.response && error.response.status === 500) {
      logger.info(`Error 500 for product id ${product.id}`);
    } else if (error.response && error.response.status === 503) {
      logger.info(`Error 503 for product id ${product.id}`);
    } else if (error.response) {
      logger.info(
        `Error ${error.response.status} for product id ${product.id}`
      );
    }
  }
};

const processBatch = async (
  req,
  res,
  next,
  productBatch,
  combinedData,
  BATCH_SIZE_FEES,
  batchIndex
) => {
  const feeEstimates = [];
  logger.info(`start delay for proccess batch of 3 sec`);
  await delay(3000);
  logger.info(`finish delay for proccess batch of 3 sec`);

  try {
    logger.info(`starting getEstimateFees for batch ${batchIndex + 1}...`);
    const data = await getEstimateFees(req, res, next, productBatch);
    logger.info(`finished getEstimateFees for batch ${batchIndex + 1}`);
    feeEstimates.push(...data);
  } catch (error) {
    logger.error(
      `getEstimateFees failed for batch ${batchIndex + 1}: ${error.message}`
    );
  }

  logger.info(
    `Start proccess of combining data keepa + orders + fees to generete the complete tracked product`
  );

  if (!productBatch || !Array.isArray(productBatch) || productBatch.length === 0) {
    throw new Error('Invalid or empty product batch');
  }

  const validProductIds = productBatch
    .filter(product => product && product.id)
    .map(product => product.id);

  if (validProductIds.length === 0) {
    throw new Error('No valid product IDs found in batch');
  }

  const productCosts = await Product.findAll({
    where: {
      id: validProductIds,
    },
    attributes: ["id", "product_cost"],
  }).catch((error) => {
    throw new Error(
      `Product.findAll failed for product costs in batch ${batchIndex + 1}: ${error.message}`
    );
  });

  const costMap = productCosts.reduce((acc, product) => {
    acc[product.id] = product.product_cost;
    return acc;
  }, {});

  if (!feeEstimates || !Array.isArray(feeEstimates)) {
    throw new Error('Invalid or missing fee estimates data');
  }

  if (!combinedData || !Array.isArray(combinedData)) {
    throw new Error('Invalid or missing combined data');
  }

  const finalData = feeEstimates
    .filter(feeEstimate => feeEstimate && feeEstimate.product_id)
    .map((feeEstimate) => {
      const combinedItem = combinedData.find(
        (item) => item && item.product_id === feeEstimate.product_id
      );

      if (!combinedItem) {
        logger.warn(`No combined data found for product_id: ${feeEstimate.product_id}`);
        return null;
      }

      const fees = feeEstimate.fees || 0;
      const productCost = costMap[feeEstimate.product_id] || 0;
      const profit = combinedItem.lowest_fba_price - fees - productCost;

      return {
        ...combinedItem,
        fees: fees,
        profit: profit,
        updatedAt: new Date(),
      };
    })
    .filter(item => item !== null);

  if (finalData.length === 0) {
    logger.warn(`No valid data could be combined for batch ${batchIndex + 1}`);
  }

  logger.info(`Saving the tracked products for batch ${batchIndex + 1}...`);

  await TrackedProduct.bulkCreate(finalData, {
    updateOnDuplicate: [
      "current_rank",
      "thirty_days_rank",
      "ninety_days_rank",
      "units_sold",
      "product_velocity",
      "lowest_fba_price",
      "fees",
      "profit",
      "updatedAt",
    ],
  })
    .then((instances) => {
      logger.info(
        `TrackedProduct.bulkCreate succeeded for batch ${batchIndex + 1}. ${instances.length
        } records saved.`
      );
    })
    .catch((error) => {
      logger.error(
        `TrackedProduct.bulkCreate failed for batch ${batchIndex + 1}: ${error.message
        }`
      );
      throw new Error(
        `TrackedProduct.bulkCreate failed for batch ${batchIndex + 1}: ${error.message
        }`
      );
    });
};

const addAccessTokenAndProcessBatch = async (
  req,
  res,
  productBatch,
  combinedData,
  batch_size_fees,
  batchIndex
) => {
  console.log("--------------------------------------");
  console.log("fetching new token for fees...");
  let accessToken = await fetchNewTokenForFees();
  console.log(accessToken);
  console.log("--------------------------------------");

  try {
    if (!accessToken) {
      console.log("Fetching new token...");
      logger.info("Fetching new token...");
      accessToken = await fetchNewTokenForFees();
    } else {
      console.log("Token is still valid...");
      logger.info("Token is still valid...");
    }

    req.headers["x-amz-access-token"] = accessToken;

    await processBatch(
      req,
      res,
      null,
      productBatch,
      combinedData,
      batch_size_fees,
      batchIndex
    );
  } catch (error) {
    console.error("Error fetching access token or processing batch:", error);
    logger.error("Error fetching access token or processing batch:", error);
  }
};

const getNewAccessToken = async () => {
  try {
    const response = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.REFRESH_TOKEN,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh token");
    }

    const data = await response.json();
    logger.info(`New access token obtained: ${data.access_token}`);
    return data.access_token;
  } catch (err) {
    logger.error("Error refreshing token:", err);
    throw new Error("Failed to refresh token");
  }
};
