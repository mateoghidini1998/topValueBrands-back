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

const LIMIT_PRODUCTS = 20000; // Límite de productos para fetch
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
        logger.error('getProductsTrackedData failed line 108', {
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

      // const trackedProducts = await TrackedProduct.findAll();
      // for (const productId of untrackedProductIds) {
      //   // 1. Buscar su ASIN
      //   const product = products.find(p => p.id === productId);
      //   if (!product) {
      //     logger.error(`Product not found for ID: ${productId}`);
      //     continue;
      //   }
      //   const asin = product.ASIN;

      //   // 2. Encontrar todos los productos con ese ASIN
      //   const productsWithSameAsin = products.filter(p => p.ASIN === asin);

      //   if (productsWithSameAsin.length < 2) {
      //     logger.error(`No multiple products found with ASIN: ${asin}`);
      //     continue;
      //   }

      //   // 3. Encontrar el trackedProduct que tiene asignado el primer producto encontrado con ese ASIN
      //   const firstProductWithSameAsin = productsWithSameAsin[0];
      //   const trackedProduct = trackedProducts.find(tp => tp.product_id === firstProductWithSameAsin.id);

      //   if (!trackedProduct) {
      //     logger.error(`Tracked product not found for first product with ASIN: ${asin}`);
      //     continue;
      //   }

      //   // 4. Para el resto de los productos crear un nuevo trackedProduct con los mismos datos
      //   for (let i = 1; i < productsWithSameAsin.length; i++) {
      //     const productWithSameAsin = productsWithSameAsin[i];
      //     const newTrackedProduct = {
      //       ...trackedProduct,
      //       product_id: productWithSameAsin.id, // Asignar el nuevo product_id
      //     };
      //     // Crear el nuevo trackedProduct (aquí deberías llamar a la función o lógica que maneja la creación de trackedProducts en tu base de datos)
      //     // await createTrackedProduct(newTrackedProduct);
      //     try {
      //       await TrackedProduct.create(newTrackedProduct);
      //       logger.info(`TrackedProduct.create successful: ${JSON.stringify(newTrackedProduct)}`);
      //       fixedProducts.push(newTrackedProduct.product_id);
      //     } catch (error) {
      //       unfixedProducts.push(newTrackedProduct.product_id);
      //       logger.error(`TrackedProduct.create failed: ${error.message, JSON.stringify(newTrackedProduct)}`);
      //     }
      //   }

      //   // 5. Mostrar los id de los productos actualizados y no actualizados
      //   logger.info(`Fixed products: [ ${Array.from(fixedProducts).join(', ')} ]`);
      //   logger.info(`Unfixed products: [ ${Array.from(unfixedProducts).join(', ')} ]`);

      // }

      fixUntrackedProducts(untrackedProductIds, fixedProducts, unfixedProducts);
    }


    // Segunda etapa: Obtener las estimaciones de tarifas y actualizar la información de los productos usando BATCH_SIZE
    for (let i = 0; i < relatedProducts.length; i += BATCH_SIZE_FEES) {
      const productBatch = relatedProducts.slice(i, i + BATCH_SIZE_FEES);
      logger.info(`Fetching estimate fees for batch ${i / BATCH_SIZE_FEES + 1} / ${(relatedProducts.length / BATCH_SIZE_FEES).toFixed(0)} with ${productBatch.length} products`);

      await new Promise((resolve) => setTimeout(resolve, MS_DELAY_FEES));
      logger.info(`Finished waiting ${MS_DELAY_FEES} ms`);

      const feeEstimates = await getEstimateFees(req, res, next, productBatch).catch((error) => {
        logger.error(`getEstimateFees failed for batch ${i / BATCH_SIZE_FEES + 1}: ${error.message}`);
        throw new Error(`getEstimateFees failed for batch ${i / BATCH_SIZE_FEES + 1}: ${error.message}`);
      });
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
    });
    logger.info('Response sent successfully');
  } catch (error) {
    logger.error('line 236 error: ', {
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

const GROUPS_ASINS = 60;
const MS_DELAY_KEEPA = 65000 // 10 seconds

const getProductsTrackedData = async (products) => {
  logger.info(`Starting getProductsTrackedData with ${products.length} products`);
  logger.info(`Groups of ${GROUPS_ASINS} ASINs will be processed in batches of ${GROUPS_ASINS} products`);
  logger.info(`MS_DELAY_KEEPA: ${MS_DELAY_KEEPA}`);
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
    try {
      console.log('getting keepadata for', asinGroup)
      const keepaDataResponse = await getKeepaData(asinGroup);
      keepaResponses.push(keepaDataResponse);
      logger.info(`getKeepaData succeeded for group number ${asinGroups.indexOf(asinGroup) + 1} / ${asinGroups.length}: [ ${asinGroup} ]`);
    } catch (error) {
      logger.error(`getKeepaData failed. Group: ${asinGroup}: ${error.message}`);
      try {
        await delay(MS_DELAY_KEEPA * 2); // delay
        const keepaDataResponse = await getKeepaData(asinGroup);
        keepaResponses.push(keepaDataResponse);
      } catch (error) {
        logger.error(`getKeepaData failed after 2 (second) try. Group: ${asinGroup}: ${error.message}`);
      }
      // Log the error but continue with the next group
      continue;
    }
    await delay(MS_DELAY_KEEPA); // Delay between API calls
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
const getKeepaData = async (asinGroup, retryCount = 0) => {
  const apiKey = process.env.KEEPA_API_KEY;
  const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1&offers=20`;
  try {
    const response = await axios.get(url);
    if (!response.data) {
      throw new Error('No data received from Keepa');
    }
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 429) {

      if (retryCount < 3) { // Intenta un máximo de 3 veces
        if (retryCount == 2) {
          await delay(60000); // Espera 60 segundos antes de reintentar
        } else {
          await delay(5000); // Espera 5 segundos antes de reintentar
        }
        return getKeepaData(asinGroup, retryCount + 1);
      } else {
        throw new Error(`Failed after 3 retries: ${error.message}`);
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
  try {
    const feeEstimate = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      const estimateFeesForProduct = async () => {
        const url = `https://sellingpartnerapi-na.amazon.com/products/fees/v0/items/${product.ASIN}/feesEstimate`;
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
            Identifier: product.ASIN,
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

        feeEstimate.push({
          product_id: product.id,
          fees: feesEstimate,
        });

        logger.info(`Fees estimated for product id ${product.id}`);
      };

      try {
        await estimateFeesForProduct();
      } catch (error) {
        logger.error(`Error estimating fees for product id ${product.id}, retrying in 5 seconds: ${error.message}`);
        await delay(5000);
        try {
          await estimateFeesForProduct();
        } catch (retryError) {
          logger.error(`Retry failed for product id ${product.id}: ${retryError.message}`);
          feeEstimate.push({
            product_id: product.id,
            fees: null,
            // error: retryError.message
          });
        }
      }

      // Esperar 2100ms después de cada dos peticiones
      if (i % 2 === 1) {
        await delay(2100);
      }
    }

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

      console.log(untrackedProduct.ASIN);

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