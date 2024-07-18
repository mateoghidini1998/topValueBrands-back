const { Product, TrackedProduct, Supplier } = require('../models');
const axios = require('axios');
const asyncHandler = require('../middlewares/async');
const { generateOrderReport } = require('../utils/utils');
const dotenv = require('dotenv');
const logger = require('../logger/logger');

dotenv.config({ path: './.env' });

const fetchProducts = async ({ limit = LIMIT_PRODUCTS, offset = OFFSET_PRODUCTS }) => {
  return await Product.findAll({ limit, offset });
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//@route GET api/v1/pogenerator/trackedproducts
//@desc  Get all tracked products
//@access Private
exports.getTrackedProducts = asyncHandler(async (req, res, next) => {
  console.log('Executing getTrackedProducts...');
  logger.info('Executing getTrackedProducts...');

  const { supplier_id } = req.query;

  const findAllOptions = {
    include: [
      {
        model: Product,
        as: 'product',
        attributes: [
          'product_name',
          'ASIN',
          'seller_sku',
          'product_cost',
          'product_image',
          'supplier_id',
        ],
        include: [
          {
            model: Supplier,
            as: 'supplier',
            attributes: ['supplier_name'],
          },
        ],
      },
    ],
  };

  if (supplier_id) {
    findAllOptions.include[0].where = {
      supplier_id: supplier_id,
    };
    logger.info('Filtering by supplier_id', { supplier_id });
  }

  try {
    const trackedProducts = await TrackedProduct.findAll(findAllOptions);
    logger.info('Tracked products found successfully', { count: trackedProducts.length });

    const flattenedTrackedProducts = trackedProducts.map((trackedProduct) => {
      const { product, ...trackedProductData } = trackedProduct.toJSON();
      const { supplier, ...productData } = product;
      return {
        ...trackedProductData,
        ...productData,
        supplier_name: supplier ? supplier.supplier_name : null,
      };
    });

    res.status(200).json({
      success: true,
      data: flattenedTrackedProducts,
    });

    logger.info('Tracked products sent successfully');
  } catch (error) {
    logger.error('There was an error while obtaining tracked products', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'There was an error while obtaining tracked products',
    });
  }
});
//@route GET api/v1/pogenerator/trackedproducts
//@desc  Track products and save them into db from keepa api data and order reports from AMZ API.
//@access Private
// exports.generateTrackedProductsData = asyncHandler(async (req, res, next) => {
//   logger.info('Start generateTrackedProductsData');

//   try {
//     const products = await fetchProducts({ limit: LIMIT_PRODUCTS });
//     logger.info('Fetched products successfully');

//     const [orderData, keepaData] = await Promise.all([
//       saveOrders(req, res, next, products),
//       getProductsTrackedData(products),
//     ]);
//     logger.info('Fetched order data and keepa data successfully');

//     const combinedData = keepaData.map((keepaItem) => {
//       const orderItem = orderData.find((o) => o.product_id === keepaItem.product_id) || {};
//       const unitsSold = orderItem.quantity || 0;
//       const productVelocity = orderItem.velocity || 0;
//       const lowestFbaPriceInDollars = keepaItem.lowestFbaPrice ? keepaItem.lowestFbaPrice / 100 : null;

//       return {
//         product_id: keepaItem.product_id,
//         current_rank: keepaItem.currentSalesRank || null,
//         thirty_days_rank: keepaItem.avg30 || null,
//         ninety_days_rank: keepaItem.avg90 || null,
//         units_sold: unitsSold,
//         product_velocity: productVelocity,
//         lowest_fba_price: lowestFbaPriceInDollars,
//       };
//     });

//     await TrackedProduct.bulkCreate(combinedData, {
//       updateOnDuplicate: [
//         'current_rank',
//         'thirty_days_rank',
//         'ninety_days_rank',
//         'units_sold',
//         'product_velocity',
//         'lowest_fba_price',
//       ],
//     });
//     logger.info('Combined data bulk created successfully');

//     const feeEstimates = await getEstimateFees(req, res, next, products);
//     console.log(`feeEstimates cantidad registros: ${feeEstimates.length}`);
//     console.log(`feeEstimates registro ejemplo 1: ${feeEstimates[0]}`);
//     logger.info('Fetched fee estimates successfully');

//     const productCosts = await Product.findAll({
//       where: {
//         id: products.map((product) => product.id),
//       },
//       attributes: ['id', 'product_cost'],
//     });
//     logger.info('Fetched product costs successfully');

//     const costMap = productCosts.reduce((acc, product) => {
//       acc[product.id] = product.product_cost;
//       return acc;
//     }, {});

//     const updatePromises = feeEstimates.map((feeEstimate) => {
//       const productCost = costMap[feeEstimate.product_id] || 0;
//       const lowestFbaPrice = combinedData.find((item) => item.product_id === feeEstimate.product_id)?.lowest_fba_price || 0;
//       const fees = feeEstimate.fees || 0;
//       const profit = lowestFbaPrice - fees - productCost;

//       return TrackedProduct.update(
//         {
//           fees: fees,
//           profit: profit,
//         },
//         { where: { product_id: feeEstimate.product_id } }
//       );
//     });

//     await Promise.all(updatePromises);
//     logger.info('Batch update of fees and profit completed successfully');

//     res.status(200).json({
//       message: 'Data combined and saved successfully.',
//       data: combinedData,
//     });
//     logger.info('Response sent successfully');
//   } catch (error) {
//     logger.error('Error combining and saving data', { error: error.message });
//     // res.status(500).json({
//     //   success: false,
//     //   message: 'Error combining and saving data.',
//     // });
//   }
// });

const BATCH_SIZE = 20; // Tamaño del batch para la segunda etapa
const LIMIT_PRODUCTS = 250; // Límite de productos para fetch
const OFFSET_PRODUCTS = 335; // Límite de productos para fetch
const MAX_REQUESTS_BEFORE_DELAY = 20; // Límite de solicitudes antes de aplicar un delay
const DELAY_TIME_MS = 30000; // Tiempo de delay en milisegundos

exports.generateTrackedProductsData = asyncHandler(async (req, res, next) => {
  logger.info('Start generateTrackedProductsData');

  try {
    const products = await fetchProducts({ limit: LIMIT_PRODUCTS });
    logger.info('Fetched products successfully');

    // Primera etapa: Guardar los productos combinados sin usar BATCH_SIZE
    const [orderData, keepaData] = await Promise.all([
      saveOrders(req, res, next, products).catch((error) => {
        throw new Error(`saveOrders failed: ${error.message}`);
      }),
      getProductsTrackedData(products).catch((error) => {
        throw new Error(`getProductsTrackedData failed: ${error.message}`);
      }),
    ]);
    logger.info('Fetched order data and keepa data successfully');

    const combinedData = keepaData.map((keepaItem) => {
      const orderItem = orderData.find((o) => o.product_id === keepaItem.product_id) || {};
      const unitsSold = orderItem.quantity || 0;
      const productVelocity = orderItem.velocity || 0;
      const lowestFbaPriceInDollars = keepaItem.lowestFbaPrice ? keepaItem.lowestFbaPrice / 100 : null;

      return {
        product_id: keepaItem.product_id,
        current_rank: keepaItem.currentSalesRank || null,
        thirty_days_rank: keepaItem.avg30 || null,
        ninety_days_rank: keepaItem.avg90 || null,
        units_sold: unitsSold,
        product_velocity: productVelocity,
        lowest_fba_price: lowestFbaPriceInDollars,
      };
    });

    await TrackedProduct.bulkCreate(combinedData, {
      updateOnDuplicate: [
        'current_rank',
        'thirty_days_rank',
        'ninety_days_rank',
        'units_sold',
        'product_velocity',
        'lowest_fba_price',
      ],
    });
    logger.info('Combined data saved successfully');

    // Segunda etapa: Obtener las estimaciones de tarifas y actualizar la información de los productos usando BATCH_SIZE
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const productBatch = products.slice(i, i + BATCH_SIZE);
      console.log('fetching get estimate fees for batch for' + productBatch.length);

      console.log('waiting 1 min')
      // await delay(DELAY_TIME_MS_ESTIMATE_FEES);
      await new Promise((resolve) => setTimeout(resolve, DELAY_TIME_MS));
      console.log('finished waiting 1min')

      const feeEstimates = await getEstimateFees(req, res, next, productBatch).catch((error) => {
        logger.error(`getEstimateFees failed for batch ${i / BATCH_SIZE + 1}: ${error.message}`);
        console.log(`getEstimateFees failed for batch ${i / BATCH_SIZE + 1}: ${error.message}`);
        // throw new Error(`getEstimateFees failed for batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      });
      logger.info(`Fetched fee estimates for batch ${i / BATCH_SIZE + 1} successfully`);

      const productCosts = await Product.findAll({
        where: {
          id: productBatch.map((product) => product.id),
        },
        attributes: ['id', 'product_cost'],
      }).catch((error) => {
        throw new Error(`Product.findAll failed for batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      });
      logger.info(`Fetched product costs for batch ${i / BATCH_SIZE + 1} successfully`);

      const costMap = productCosts.reduce((acc, product) => {
        acc[product.id] = product.product_cost;
        return acc;
      }, {});

      const finalData = feeEstimates.map((feeEstimate) => {
        const combinedItem = combinedData.find((item) => item.product_id === feeEstimate.product_id);
        const fees = feeEstimate.fees || 0;
        const productCost = costMap[feeEstimate.product_id] || 0;
        const profit = combinedItem.lowest_fba_price - fees - productCost;

        return {
          ...combinedItem,
          fees: fees,
          profit: profit,
        };



      });

      await TrackedProduct.bulkCreate(finalData, {
        updateOnDuplicate: [
          'current_rank',
          'thirty_days_rank',
          'ninety_days_rank',
          'units_sold',
          'product_velocity',
          'lowest_fba_price',
          'fees',
          'profit',
        ],
      }).catch((error) => {
        throw new Error(`TrackedProduct.bulkCreate failed for batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      });
      logger.info(`Batch ${i / BATCH_SIZE + 1} updated with fees and profit successfully`);
    }

    logger.info('All batches saved successfully');

    res.status(200).json({
      message: 'Data combined and saved successfully.',
    });
    logger.info('Response sent successfully');
  } catch (error) {
    logger.error('Error combining and saving data', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});





//Function to group asins into groups of GROUPS_ASINS

const GROUPS_ASINS = 20;

const getProductsTrackedData = async (products) => {
  const asinGroups = [];

  for (let i = 0; i < products.length; i += GROUPS_ASINS) {
    const group = products
      .slice(i, i + GROUPS_ASINS)
      .map((product) => product.ASIN)
      .join(',');
    asinGroups.push(group);
  }
  console.log(asinGroups)

  const keepaResponses = [];
  for (const asinGroup of asinGroups) {
    console.log('getting keepadata for', asinGroup)
    const keepaDataResponse = await getKeepaData(asinGroup);
    keepaResponses.push(keepaDataResponse);
    await delay(10000); // Delay between API calls
  }

  const processedData = keepaResponses.flatMap((response) =>
    response.products.map((product) => {
      const matchingProduct = products.find((p) => p.ASIN === product.asin);
      let lowestPrice =
        product.stats.buyBoxPrice > 0
          ? product.stats.buyBoxPrice
          : product.stats.current[10] > 0
            ? product.stats.current[10]
            : product.stats.current[7];

      return {
        product_id: matchingProduct.id,
        currentSalesRank: product.stats.current[3],
        avg30: product.stats.avg30[3],
        avg90: product.stats.avg90[3],
        lowestFbaPrice: lowestPrice,
      };
    })
  );
  return processedData;
};

//Function to retrieve sales ranks from keepa API. Each request receives a group of 20 ASINs
const getKeepaData = async (asinGroup) => {
  const apiKey = process.env.KEEPA_API_KEY;
  const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1&offers=20`;
  const response = await axios.get(url);
  if (!response.data) {
    throw new Error('No data received from Keepa');
  }
  return response.data;
};

const saveOrders = async (req, res, next, products) => {
  console.log("Executing saveOrders...")
  logger.info("Executing saveOrders...")
  const jsonData = await generateOrderReport(req, res, next);

  if (!jsonData) {
    throw new Error('Failed to retrieve orders');
  }

  const filteredOrders = jsonData.filter(
    (item) =>
      item['order-status'] === 'Shipped' &&
      new Date() - new Date(item['purchase-date']) <= 30 * 24 * 60 * 60 * 1000
  );

  const skuQuantities = filteredOrders.reduce((acc, item) => {
    const { sku, quantity, asin } = item;
    const qty = parseInt(quantity, 10);
    if (!acc[sku]) {
      acc[sku] = { quantity: qty, asin };
    } else {
      acc[sku].quantity += qty;
    }
    return acc;
  }, {});

  const asinToProductId = products.reduce((acc, product) => {
    acc[product.ASIN] = product.id;
    return acc;
  }, {});

  const finalJson = Object.entries(skuQuantities).map(
    ([sku, { quantity, asin }]) => ({
      sku,
      product_id: asinToProductId[asin],
      quantity,
      velocity: quantity / 30,
    })
  );

  return finalJson;
};

const getEstimateFees = async (req, res, next, products) => {
  console.log("Executing getEstimateFees... for products: ", products.length + " products")
  // logger.info("Executing getEstimateFees... for products: ", products.length + " products")
  const feeEstimate = await Promise.all(
    products.map(async (product, index) => {
      console.log(`Executing getEstimateFees... for product ${product.seller_sku}...`);
      // logger.info(`Executing getEstimateFees... for product ${product.ASIN}...`);
      const url = `https://sellingpartnerapi-na.amazon.com/products/fees/v0/listings/${product.seller_sku}/feesEstimate`;
      const trackedProduct = await TrackedProduct.findOne({
        where: { product_id: product.id },
      });

      if (!trackedProduct) {
        throw new Error(
          `TrackedProduct not found for product id ${product.id}`
        );
      }

      const body = {
        FeesEstimateRequest: {
          MarketplaceId: 'ATVPDKIKX0DER',
          IsAmazonFulfilled: true,
          Identifier: product.seller_sku,
          PriceToEstimateFees: {
            ListingPrice: {
              Amount: trackedProduct.lowest_fba_price.toString(),
              CurrencyCode: 'USD',
            },
          },
        },
      };

      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'x-amz-access-token': req.headers['x-amz-access-token'],
        },
      });

      const feesEstimate =
        response.data?.payload?.FeesEstimateResult?.FeesEstimate
          ?.TotalFeesEstimate?.Amount || null;

      return {
        product_id: product.id,
        fees: feesEstimate,
      };
    })
  );

  return feeEstimate;
};


// const getEstimateFees = async (req, res, next, products) => {
//   console.log("Executing getEstimateFees... for products: ", products.length + " products")
//   logger.info("Executing getEstimateFees... for products: ", products.length + " products")

//   const feeEstimate = [];
//   let requestCount = 0;

//   for (const product of products) {
//     console.log(`Executing getEstimateFees... for product ${product.ASIN}...`);
//     logger.info(`Executing getEstimateFees... for product ${product.ASIN}...`);
//     const url = `https://sellingpartnerapi-na.amazon.com/products/fees/v0/items/${product.ASIN}/feesEstimate`;
//     const trackedProduct = await TrackedProduct.findOne({
//       where: { product_id: product.id },
//     });

//     if (!trackedProduct) {
//       throw new Error(
//         `TrackedProduct not found for product id ${product.id}`
//       );
//     }

//     const body = {
//       FeesEstimateRequest: {
//         MarketplaceId: 'ATVPDKIKX0DER',
//         IsAmazonFulfilled: true,
//         Identifier: product.ASIN,
//         PriceToEstimateFees: {
//           ListingPrice: {
//             Amount: trackedProduct.lowest_fba_price.toString(),
//             CurrencyCode: 'USD',
//           },
//         },
//       },
//     };

//     if (requestCount > 0 && requestCount % MAX_REQUESTS_BEFORE_DELAY_ESTIMATE_FEES === 0) {
//       await delay(DELAY_TIME_MS_ESTIMATE_FEES);
//     }

//     const response = await axios.post(url, body, {
//       headers: {
//         'Content-Type': 'application/json',
//         'x-amz-access-token': req.headers['x-amz-access-token'],
//       },
//     });

//     requestCount++;

//     if (!response.data || !response.data.FeesEstimateResult) {
//       throw new Error(`Failed to retrieve fee estimate for ${product.ASIN}`);
//     }

//     const feesEstimateResult = response.data.FeesEstimateResult;

//     if (
//       !feesEstimateResult ||
//       !feesEstimateResult.FeesEstimateIdentifier ||
//       !feesEstimateResult.FeesEstimate
//     ) {
//       throw new Error(
//         `Invalid fee estimate result for product id ${product.id}`
//       );
//     }

//     const feesEstimate = feesEstimateResult.FeesEstimate.TotalFeesEstimate.Amount;
//     feeEstimate.push({
//       product_id: product.id,
//       fees: feesEstimate,
//     });
//   }
//   return feeEstimate;
// };


exports.getEstimateFees = asyncHandler(async (req, res, next) => {

  const products = await TrackedProduct.findAll();


  console.log("Executing getEstimateFees... for products: ", products.length + " products")
  logger.info("Executing getEstimateFees... for products: ", products.length + " products")

  const feeEstimate = [];
  let requestCount = 0;

  for (const product of products) {
    console.log(`Executing getEstimateFees... for product ${product.ASIN}...`);
    logger.info(`Executing getEstimateFees... for product ${product.ASIN}...`);
    const url = `https://sellingpartnerapi-na.amazon.com/products/fees/v0/items/${product.ASIN}/feesEstimate`;
    const trackedProduct = await TrackedProduct.findOne({
      where: { product_id: product.id },
    });

    console.log(trackedProduct.toString());

    if (!trackedProduct) {
      throw new Error(
        `TrackedProduct not found for product id ${product.id}`
      );
    }

    const body = {
      FeesEstimateRequest: {
        MarketplaceId: 'ATVPDKIKX0DER',
        IsAmazonFulfilled: true,
        Identifier: product.ASIN,
        PriceToEstimateFees: {
          ListingPrice: {
            Amount: trackedProduct.lowest_fba_price.toString(),
            CurrencyCode: 'USD',
          },
        },
      },
    };

    if (requestCount > 0 && requestCount % MAX_REQUESTS_BEFORE_DELAY_ESTIMATE_FEES === 0) {
      await delay(DELAY_TIME_MS_ESTIMATE_FEES);
    }

    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': req.headers['x-amz-access-token'],
      },
    });

    requestCount++;

    if (!response.data || !response.data.FeesEstimateResult) {
      throw new Error(`Failed to retrieve fee estimate for ${product.ASIN}`);
    }

    const feesEstimateResult = response.data.FeesEstimateResult;

    if (
      !feesEstimateResult ||
      !feesEstimateResult.FeesEstimateIdentifier ||
      !feesEstimateResult.FeesEstimate
    ) {
      throw new Error(
        `Invalid fee estimate result for product id ${product.id}`
      );
    }

    const feesEstimate = feesEstimateResult.FeesEstimate.TotalFeesEstimate.Amount;
    feeEstimate.push({
      product_id: product.id,
      fees: feesEstimate,
    });
  }
  return feeEstimate;
});