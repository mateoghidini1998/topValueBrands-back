const { Product, TrackedProduct, Supplier } = require('../models');
const axios = require('axios');
const asyncHandler = require('../middlewares/async');
const { generateOrderReport } = require('../utils/utils');
const dotenv = require('dotenv');
const logger = require('../logger/logger');
const { Op } = require('sequelize');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

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

  const { supplier_id, keyword } = req.query;

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
        where: {},
      },
    ],
  };

  if (supplier_id) {
    findAllOptions.include[0].where.supplier_id = supplier_id;
    logger.info('Filtering by supplier_id', { supplier_id });
  }

  if (keyword) {
    findAllOptions.include[0].where[Op.or] = [
      { product_name: { [Op.like]: `%${keyword}%` } },
      { ASIN: { [Op.like]: `%${keyword}%` } },
      { seller_sku: { [Op.like]: `%${keyword}%` } },
    ];
    logger.info('Filtering by keyword', { keyword });
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

const LIMIT_PRODUCTS = 10000; // Límite de productos para fetch
const OFFSET_PRODUCTS = 0; // Límite de productos para fetch

const BATCH_SIZE_FEES = 50; // Tamaño del batch para la segunda etapa
const MS_DELAY_FEES = 2000; // Tiempo de delay en milisegundos

exports.generateTrackedProductsData = asyncHandler(async (req, res, next) => {
  logger.info('Start generateTrackedProductsData');

  try {
    const products = await fetchProducts({ limit: LIMIT_PRODUCTS });
    logger.info('Fetched products successfully');

    // Primera etapa: Guardar los productos combinados sin usar BATCH_SIZE
    const [orderData, keepaData] = await Promise.all([
      saveOrders(req, res, next, products).catch((error) => {
        logger.error('saveOrders failed', {
          error: error.message,
          stack: error.stack,
        });
        throw new Error(`saveOrders failed: ${error.message}`);
      }),
      getProductsTrackedData(products).catch((error) => {
        logger.error('getProductsTrackedData failed line 118', {
          error: error.message,
          stack: error.stack,
        });
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
    }).catch((error) => {
      throw new Error(`TrackedProduct.bulkCreate failed during initial save: ${error.message}`);
    });
    logger.info('Combined data saved successfully');

    // Obtener los productos que están relacionados con los TrackedProducts
    const trackedProductIds = combinedData.map(item => item.product_id);

    const relatedProducts = await Product.findAll({
      where: {
        id: trackedProductIds,
      },
    }).catch((error) => {
      throw new Error(`Product.findAll failed for related products: ${error.message}`);
    });
    logger.info('Fetched related products successfully');

    // Encontrar y registrar los productos no registrados como TrackedProducts
    const allProductIds = products.map(product => product.id);
    const untrackedProductIds = allProductIds.filter(id => !trackedProductIds.includes(id));


    // Proceso para registrar los productos que no se registraron como TrackedProducts porque tenian ASIN repetidos.
    if (untrackedProductIds.length > 0) {
      logger.warn(`Products ID's not tracked:[ ${untrackedProductIds.join(', ')} ]`);
      const fixedProducts = [];
      const unfixedProducts = [];

      fixUntrackedProducts(untrackedProductIds, fixedProducts, unfixedProducts);
    }


    // Segunda etapa: Obtener las estimaciones de tarifas y actualizar la información de los productos usando BATCH_SIZE
    for (let i = 0; i < relatedProducts.length; i += BATCH_SIZE_FEES) {
      const productBatch = relatedProducts.slice(i, i + BATCH_SIZE_FEES);
      logger.info(`Fetching estimate fees for batch ${i / BATCH_SIZE_FEES + 1} / ${(relatedProducts.length / BATCH_SIZE_FEES).toFixed(0)} with ${productBatch.length} products`);

      await new Promise((resolve) => setTimeout(resolve, MS_DELAY_FEES));
      logger.info(`Finished waiting ${MS_DELAY_FEES} ms`);

      const feeEstimates = [];
      await addAccessTokenHeader(req, res, async () => {
        await getEstimateFees(req, res, next, productBatch).then((data) => {
          feeEstimates.push(...data);
        }).catch((error) => {
          logger.error(`getEstimateFees failed for batch ${i / BATCH_SIZE_FEES + 1}: ${error.message}`);
          // throw new Error(`getEstimateFees failed for batch ${i / BATCH_SIZE_FEES + 1}: ${error.message}`);
        });
      })

      // console.log(feeEstimates);

      logger.info(`Fetched fee estimates for batch ${i / BATCH_SIZE_FEES + 1} successfully`);

      const productCosts = await Product.findAll({
        where: {
          id: productBatch.map((product) => product.id),
        },
        attributes: ['id', 'product_cost'],
      }).catch((error) => {
        throw new Error(`Product.findAll failed for product costs in batch ${i / BATCH_SIZE_FEES + 1}: ${error.message}`);
      });
      logger.info(`Fetched product costs for batch ${i / BATCH_SIZE_FEES + 1} successfully`);

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
        throw new Error(`TrackedProduct.bulkCreate failed for batch ${i / BATCH_SIZE_FEES + 1}: ${error.message}`);
      });
      logger.info(`Batch ${i / BATCH_SIZE_FEES + 1} updated with fees and profit successfully`);
    }

    logger.info('All batches saved successfully');

    res.status(200).json({
      message: 'Data combined and saved successfully.',
      success: true,
      data: combinedData,
      itemsQuantity: combinedData.length,
    });
    logger.info('Response sent successfully with 200 status code. ' + JSON.stringify(combinedData.length) + ' items tracked.');
  } catch (error) {
    logger.error('line 262 error: ', {
      error: error.message,
      stack: error.stack,
    }.toString());
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stack,
    });
  }
});

//Function to group asins into groups of GROUPS_ASINS

const TOKENS_PER_REQUEST = 6;
const ASINS_PER_GROUP = 60;
const DEFAULT_DELAY = 10000; // 10 seconds default delay
const MAX_RETRIES = 3;

const getProductsTrackedData = async (products) => {
  logger.info(`Starting getProductsTrackedData with ${products.length} products`);
  logger.info(`Groups of ${ASINS_PER_GROUP} ASINs will be processed in batches of ${ASINS_PER_GROUP} products`);

  const asinGroups = [];
  for (let i = 0; i < products.length; i += ASINS_PER_GROUP) {
    const group = products
      .slice(i, i + ASINS_PER_GROUP)
      .map((product) => product.ASIN)
      .join(',');
    asinGroups.push(group);
  }

  logger.info(`Total ASIN groups to process: ${asinGroups.length}`);

  const keepaResponses = [];
  const TOKENS_PER_MIN = 60;
  let tokensLeft = ASINS_PER_GROUP * TOKENS_PER_REQUEST;
  let totalTokensConsumed = 0;
  let tokensConsumedForTheLastRequest = 0;

  // console.log(asinGroups.entries());

  for (const [index, asinGroup] of asinGroups.entries()) {
    try {
      logger.info(`Processing group ${index + 1}/${asinGroups.length}`);

      // Esperar hasta que haya suficientes tokens disponibles
      const requiredTokens = ASINS_PER_GROUP * TOKENS_PER_REQUEST; // Cantidad de tokens necesarios por solicitud
      const missingTokens = requiredTokens - tokensLeft;

      //* Si missing tokens es negativo, significa que hay suficientes tokens
      //! Si missing tokens es positivo, significa que no hay suficientes tokens y falta esa cantidad

      logger.info(`tokens consumed: ${totalTokensConsumed}`)
      logger.info(`tokens consumend for the last request: ${tokensConsumedForTheLastRequest}`)
      logger.info(`tokens left: ${tokensLeft}`)
      logger.info(`tokens refill rate: ${TOKENS_PER_MIN}`)

      if (missingTokens <= 0) {
        // Realizar la solicitud si hay suficientes tokens disponibles
        const keepaDataResponse = await getKeepaData(asinGroup);
        keepaResponses.push(keepaDataResponse);
        tokensLeft = keepaDataResponse.tokensLeft;
        totalTokensConsumed += keepaDataResponse.tokensConsumed;
        tokensConsumedForTheLastRequest = keepaDataResponse.tokensConsumed;
        logger.info(`getKeepaData succeeded for group ${index + 1}: [ ${asinGroup} ]`);

      } else {
        const waitTimeForTokens = Math.ceil((missingTokens / TOKENS_PER_MIN)) * 60000;
        logger.info(`Waiting ${waitTimeForTokens} ms to accumulate enough tokens`);
        await delay(waitTimeForTokens);

        // Recalcular tokensLeft después de esperar
        const keepaDataResponse = await getKeepaData(asinGroup);

        tokensLeft = keepaDataResponse.tokensLeft;
        tokensConsumedForTheLastRequest = keepaDataResponse.tokensConsumed;
        totalTokensConsumed += keepaDataResponse.tokensConsumed;
        keepaResponses.push(keepaDataResponse);

        logger.info(`tokens consumed: ${totalTokensConsumed}`)
        logger.info(`tokens consumend for the last request: ${tokensConsumedForTheLastRequest}`)
        logger.info(`tokens left: ${tokensLeft}`)

        logger.info(`tokens refill rate: ${TOKENS_PER_MIN}`)

        logger.info(`getKeepaData succeeded for group ${index + 1}: [ ${asinGroup} ]`);
      }

    } catch (error) {
      logger.error(`getKeepaData failed for group ${index + 1}. Group: ${asinGroup}: ${error.message}`);
    }

    // if index es multiplo de 10 entonces debemos esperar una hora antes de hacer la solicitud para el siguiente grupo

    if ((index + 1) % 10 === 0 && index + 1 !== asinGroups.length) {
      logger.info(`Waiting ${3600000} ms ->  1 hour to make the next request`);
      logger.info(`Ya se hizo la solicitud para ${(index + 1) * ASINS_PER_GROUP} / ${asinGroups.length * ASINS_PER_GROUP} productos`);
      await delay(3600000);
    }
  }

  const processedData = keepaResponses.flatMap((response) =>
    response.products.map((product) => {
      const matchingProduct = products.find((p) => p.ASIN === product.asin);
      const lowestPrice = product.stats.buyBoxPrice > 0
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

const getKeepaData = async (asinGroup, retryCount = 0) => {
  logger.info(`Executing getKeepaData with ASIN group`);
  const apiKey = process.env.KEEPA_API_KEY;
  const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1&offers=20&history=0`;

  logger.info(`Requesting Keepa data: ${url}`);
  try {
    const response = await axios.get(url);
    if (!response.data) {
      throw new Error('No data received from Keepa');
    }
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const waitTime = retryCount === MAX_RETRIES - 1 ? 60000 : 5000;
        logger.error(`429 Error: Retry ${retryCount + 1}/${MAX_RETRIES}. Waiting for ${waitTime} ms before retry.`);
        await delay(waitTime);
        return getKeepaData(asinGroup, retryCount + 1);
      } else {
        throw new Error(`Failed after ${MAX_RETRIES} retries: ${error.message}`);
      }
    } else {
      throw error;
    }
  }
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

  logger.info("The final json is: ", finalJson)
  return finalJson;
};

const getEstimateFees = async (req, res, next, products) => {
  let access_token = req.headers['x-amz-access-token'];

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const estimateFeesForProduct = async (product, retryCount = 0, productIndex) => {

    if (productIndex % 2 === 1) {
      await delay(2100)
    }

    const url = `https://sellingpartnerapi-na.amazon.com/products/fees/v0/items/${product.ASIN}/feesEstimate`;
    const trackedProduct = await TrackedProduct.findOne({
      where: { product_id: product.id },
    });

    if (!trackedProduct) {
      throw new Error(`TrackedProduct not found for product id ${product.id}`);
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

    try {
      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'x-amz-access-token': access_token,
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

      // Revisión de la expiración del token
      if (error.response && error.response.status === 403) {
        try {
          const response = await fetch('https://api.amazon.com/auth/o2/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: process.env.REFRESH_TOKEN,
              client_id: process.env.CLIENT_ID,
              client_secret: process.env.CLIENT_SECRET,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to refresh token');
          }

          const data = await response.json();
          access_token = data.access_token;
          logger.info(`New access token: ${access_token}`);
        } catch (err) {
          logger.error('Error refreshing token:', err);
        }
      }

      // Reintentar la peticion en caso de error 429
      if (error.response && error.response.status === 429) {
        logger.info(`Error 429 for product id ${product.id}`);
        if (retryCount < 3) {
          await delay(5000);
          logger.info('Waiting 5 seconds before retrying');
          logger.info(`Retrying estimate for product id ${product.id}, attempt ${retryCount + 1}`);
          return estimateFeesForProduct(product, retryCount + 1, productIndex);
        } else {
          logger.error(
            `Retry failed for product id ${product.id} after ${retryCount} attempts`
          );
        }
      }
    }
  };

  try {
    const feeEstimate = [];

    for (let i = 0; i < products.length; i++) {
      try {
        feeEstimate.push(await estimateFeesForProduct(products[i], 0, i));
      } catch (error) {
        logger.error(`Error in estimateFeesForProduct for product id ${products[i].id}: ${error.message}`);
        continue;
      }

      if (i % 2 === 1) {
        logger.info(`Waiting 3000 ms after processing 2 products`);
        await delay(3000);
        logger.info(`Finished waiting 3000 ms`);
      }
    }

    logger.info('Finished processing all products');
    return feeEstimate;
  } catch (err) {
    logger.error(`Unexpected error in getEstimateFees: ${err.message}`);
    next(err);
  }
};



async function fixUntrackedProducts(untrackedProductIds, fixedProducts, unfixedProducts) {
  for (const productId of untrackedProductIds) {
    try {
      // 1. Buscar el asin del producto no trackeado
      const untrackedProduct = await Product.findOne({ where: { id: productId } });

      // console.log(untrackedProduct.ASIN);

      if (!untrackedProduct) {
        logger.warn(`Product with ID ${productId} not found.`);
        continue;
      }

      const { ASIN } = untrackedProduct;

      // 2. Encontrar todos los productos con ese asin
      const productsWithSameAsin = await Product.findAll({ where: { ASIN } });

      // 3. Encontrar el TrackedProduct del primer producto encontrado con ese asin
      const firstProduct = productsWithSameAsin[0];
      const trackedProduct = await TrackedProduct.findOne({ where: { product_id: firstProduct.id } });

      if (!trackedProduct) {
        logger.warn(`TrackedProduct for Product with ID ${firstProduct.id} not found.`);
        continue;
      }

      // 4. Crear un nuevo TrackedProduct para cada uno de los productos restantes
      for (const product of productsWithSameAsin.slice(1)) {
        const newTrackedProductData = {
          ...trackedProduct.dataValues, // Copiar todos los valores del trackedProduct original
          product_id: product.id, // Asignar el nuevo product_id
          createdAt: new Date(), // Actualizar la fecha de creación
          updatedAt: new Date() // Actualizar la fecha de actualización
        };

        delete newTrackedProductData.id; // Eliminar el ID para que se genere uno nuevo

        try {
          const newTrackedProduct = await TrackedProduct.create(newTrackedProductData);
          fixedProducts.push(product.id);
          logger.info(`TrackedProduct.create successful: ${JSON.stringify(newTrackedProduct)}`);


        } catch (error) {
          unfixedProducts.push(product.id);
          logger.error(`Error fixing product with ID ${productId}: ${error.message}`);
        }

      }
    } catch (error) {
      logger.error(`Error fixing product with ID ${productId}: ${error.message}`);
    }
  }

  // 5. Mostrar los id de los productos actualizados y no actualizados
  logger.info(`Fixed products: [ ${Array.from(fixedProducts).join(', ')} ]`);
  logger.info(`Unfixed products: [ ${Array.from(unfixedProducts).join(', ')} ]`);
}