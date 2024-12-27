const { Product, TrackedProduct, Supplier, User, PurchaseOrderProduct } = require('../models');
const axios = require('axios');
const asyncHandler = require('../middlewares/async');
const { generateOrderReport } = require('../utils/utils');
const dotenv = require('dotenv');
const logger = require('../logger/logger');
const { Op } = require('sequelize');
const { fetchNewTokenForFees } = require('../middlewares/lwa_token');

dotenv.config({ path: './.env' });

// Convertir las variables de entorno a números o usar valores por defecto si no son válidas
const LIMIT_PRODUCTS = parseInt(process.env.LIMIT_PRODUCTS, 10) || 20000;
const OFFSET_PRODUCTS = parseInt(process.env.OFFSET_PRODUCTS, 10) || 0;
const BATCH_SIZE_FEES = parseInt(process.env.BATCH_SIZE_FEES, 10) || 50;
const MS_DELAY_FEES = parseInt(process.env.MS_DELAY_FEES, 10) || 2000;
const ASINS_PER_GROUP = parseInt(process.env.ASINS_PER_GROUP, 10) || 70;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 3;

// const LIMIT_PRODUCTS = 20000;
// const OFFSET_PRODUCTS = 0;
// const BATCH_SIZE_FEES = 50;
// const MS_DELAY_FEES = 2000; // Tiempo de delay en milisegundos
// const ASINS_PER_GROUP = 70;
// const MAX_RETRIES = 3;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchProducts = async ({ limit = LIMIT_PRODUCTS, offset = OFFSET_PRODUCTS }) => {
  return await Product.findAll({ limit, offset });
};

//@route GET api/v1/pogenerator/trackedproducts
//@desc  Get all tracked products
//@access Private
exports.getTrackedProducts = asyncHandler(async (req, res) => {
  console.log('Executing getTrackedProducts...');
  logger.info('Executing getTrackedProducts...');

  // Obtener el rol del usuario para restringir el acceso
  // const user = await User.findOne({ where: { id: req.user.id } });

  // if (user.role !== 'admin') {
  //   return res.status(401).json({ msg: 'Unauthorized' });
  // }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const keyword = req.query.keyword || '';
  const supplier_id = req.query.supplier || null;
  const orderBy = req.query.orderBy || 'updatedAt';
  const orderWay = req.query.orderWay || 'ASC';

  const includeProduct = {
    model: Product,
    as: 'product',
    attributes: [
      'product_name',
      'ASIN',
      'seller_sku',
      'product_cost',
      'product_image',
      'supplier_id',
      'in_seller_account',
      'FBA_available_inventory',
      'reserved_quantity',
      'Inbound_to_FBA',
      'supplier_item_number',
    ],
    include: [
      {
        model: Supplier,
        as: 'supplier',
        attributes: ['supplier_name'],
      },
    ],
    where: {},
  };

  const whereConditions = {
    is_active: true,
  };

  if (keyword) {
    includeProduct.where[Op.or] = [
      { product_name: { [Op.like]: `%${keyword}%` } },
      { ASIN: { [Op.like]: `%${keyword}%` } },
      { seller_sku: { [Op.like]: `%${keyword}%` } },
    ];
  }

  if (supplier_id) {
    includeProduct.where.supplier_id = {
      [Op.eq]: supplier_id,
      [Op.ne]: null,
    };
  }

  try {
    const trackedProducts = await TrackedProduct.findAndCountAll({
      offset,
      limit,
      order: [[orderBy, orderWay]],
      where: whereConditions,
      include: [includeProduct],
    });

    const totalPages = Math.ceil(trackedProducts.count / limit);

    const flattenedTrackedProducts = trackedProducts.rows.map((trackedProduct) => {
      const { product, ...trackedProductData } = trackedProduct.toJSON();
      const { supplier, ...productData } = product;
      return {
        ...trackedProductData,
        ...productData,
        supplier_name: supplier ? supplier.supplier_name : null,
        roi: product.product_cost > 0 ? (trackedProductData.profit / product.product_cost) * 100 : 0
      };
    });



    res.status(200).json({
      success: true,
      total: trackedProducts.count,
      pages: totalPages,
      currentPage: page,
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

exports.getTrackedProductsFromAnOrder = asyncHandler(async (req, res) => {

  // 1. get the purchaseorderproducts by purchase_order_id
  const products = await PurchaseOrderProduct.findAll({ where: { purchase_order_id: req.params.id } });
  if (!products) {
    return res.status(404).json({ message: 'Products not found' });
  }

  // 2. get the trackedproducts by product_id
  const trackedProducts = await TrackedProduct.findAll({ where: { product_id: products.map(product => product.product_id) } });
  if (!trackedProducts) {
    return res.status(404).json({ message: 'Tracked products not found' });
  }

  // 3. transform the trackedproducts to include product_name, ASIN, seller_sku, supplier_name, product_image

  const productsOfTheOrder = await Promise.all(trackedProducts.map(async (trackedProduct) => {

    const product = await Product.findOne({ where: { id: trackedProduct.product_id } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const supplier = await Supplier.findOne({ where: { id: product.supplier_id } });
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    return {
      ...trackedProduct.toJSON(),
      product_name: product.product_name,
      ASIN: product.ASIN,
      seller_sku: product.seller_sku,
      supplier_name: supplier.supplier_name,
      product_image: product.product_image,
      product_cost: product.product_cost,
      in_seller_account: product.in_seller_account
    };

  }));

  // 4. return the transformed trackedproducts
  const transformedTrackedProductsForTable = productsOfTheOrder.map((product) => {
    const { product_name, ASIN, seller_sku, supplier_name, product_image, product_cost, ...trackedProducts } = product;
    return {
      ...trackedProducts,
      product_name,
      ASIN,
      seller_sku,
      supplier_name,
      product_image,
      product_cost
    };
  })


  return res.status(200).json({
    success: true,
    data: transformedTrackedProductsForTable
  });


});

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


    //* Segunda etapa: Obtener las estimaciones de tarifas y actualizar la información de los productos usando BATCH_SIZE

    logger.info(`Batch size fees: ${BATCH_SIZE_FEES}`);

    for (let i = 0; i < relatedProducts.length; i += BATCH_SIZE_FEES) {
      const productBatch = relatedProducts.slice(i, i + BATCH_SIZE_FEES);
      logger.info(`Fetching estimate fees for batch ${i / BATCH_SIZE_FEES + 1} / ${(relatedProducts.length / BATCH_SIZE_FEES).toFixed(0)} with ${productBatch.length} products`);
      await delay(MS_DELAY_FEES); // Espera antes de procesar el siguiente lote

      await addAccessTokenAndProcessBatch(req, res, productBatch, combinedData, BATCH_SIZE_FEES, i / BATCH_SIZE_FEES);

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
    logger.error(error.message);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stack,
    });
  }
});

const getProductsTrackedData = async (products) => {
  logger.info(`Starting getProductsTrackedData with ${products.length} products`);
  logger.info(`Groups of ${ASINS_PER_GROUP} ASINs will be processed in batches of ${ASINS_PER_GROUP} products`);

  // Agrupar productos por ASIN para evitar duplicados
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
    const group = uniqueASINs.slice(i, i + ASINS_PER_GROUP).join(',');
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
        keepaResponses.push(keepaDataResponse);
        tokensLeft = keepaDataResponse.tokensLeft;
        totalTokensConsumed += keepaDataResponse.tokensConsumed;
        logger.info(`getKeepaData succeeded for group ${index + 1}: [ ${asinGroup} ]`);
      } else {
        const waitTimeForTokens = Math.ceil((missingTokens / TOKENS_PER_MIN)) * 60000;
        logger.info(`Waiting ${waitTimeForTokens} ms to accumulate enough tokens`);
        await delay(waitTimeForTokens);

        const keepaDataResponse = await getKeepaData(asinGroup);
        tokensLeft = keepaDataResponse.tokensLeft;
        totalTokensConsumed += keepaDataResponse.tokensConsumed;
        keepaResponses.push(keepaDataResponse);

        logger.info(`getKeepaData succeeded for group ${index + 1}: [ ${asinGroup} ]`);
      }

    } catch (error) {
      logger.error(`getKeepaData failed for group ${index + 1}. Group: ${asinGroup}: ${error.message}`);
    }

    if (tokensLeft <= REQUIRED_TOKENS && index + 1 !== asinGroups.length) {
      logger.info(`Waiting ${(REQUIRED_TOKENS / TOKENS_PER_MIN) * 60000} ms to refill tokens`);
      await delay(Math.ceil(REQUIRED_TOKENS / TOKENS_PER_MIN) * 60000);
    }
  }

  const processedData = keepaResponses.flatMap((response) =>
    response.products.flatMap((product) => {
      const matchingProducts = uniqueProductsMap[product.asin];
      const lowestPrice = product.stats.buyBoxPrice > 0
        ? product.stats.buyBoxPrice
        : product.stats.current[10] > 0
          ? product.stats.current[10]
          : product.stats.current[7];

      return matchingProducts.map((matchingProduct) => ({
        product_id: matchingProduct.id,
        currentSalesRank: product.stats.current[3],
        avg30: product.stats.avg30[3],
        avg90: product.stats.avg90[3],
        lowestFbaPrice: lowestPrice,
      }));
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
    logger.error('Generating order report failed');
    throw new Error('Failed to retrieve orders');
  }

  const filteredOrders = jsonData.filter(
    (item) =>
      (item['order-status'] === 'Shipped' || item['order-status'] === 'Pending') &&
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
    if (!acc[product.ASIN]) {
      acc[product.ASIN] = [];
    }
    acc[product.ASIN].push(product.id);
    return acc;
  }, {});


  const finalJson = Object.entries(skuQuantities).flatMap(
    ([sku, { quantity, asin }]) => {
      return (asinToProductId[asin] || []).map(productId => ({
        sku,
        product_id: productId,
        quantity,
        velocity: quantity / 30,
      }));
    }
  );


  logger.info("The final json is: ", finalJson)
  return finalJson;
};

const getEstimateFees = async (req, res, next, products) => {
  let accessToken = req.headers['x-amz-access-token'];
  const feeEstimate = [];

  try {
    for (let i = 0; i < products.length; i += 2) {
      try {
        await delay(2100); // Espera 2.1 segundos antes de procesar el siguiente producto
        feeEstimate.push(await estimateFeesForProduct(products[i], accessToken));
        feeEstimate.push(await estimateFeesForProduct(products[i + 1], accessToken));
      } catch (error) {
        logger.error(`Error in estimateFeesForProduct for product id ${products[i].id}: ${error.message}`);
      }
    }

    logger.info('Finished processing all products');
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
        'x-amz-access-token': accessToken,
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
    logger.error(`Error estimating fees for product id ${product.id}. ${error.message}`);

    // Log if the error is 403 -> access token expired
    if (error.response && error.response.status === 403) {
      logger.info(`Error 403 for product id ${product.id} and refreshing access token...`);
      accessToken = await getNewAccessToken();
      return estimateFeesForProduct(product, accessToken);
    }

    // Log if the error is 429 -> rate limit
    if (error.response && error.response.status === 429) {
      logger.info(`Error 429 for product id ${product.id}`);
    } else if (error.response && error.response.status === 400) {
      logger.info(`Error 400 for product id ${product.id}`);
    } else if (error.response && error.response.status === 500) {
      logger.info(`Error 500 for product id ${product.id}`);
    } else if (error.response && error.response.status === 503) {
      logger.info(`Error 503 for product id ${product.id}`);
    } else if (error.response) {
      logger.info(`Error ${error.response.status} for product id ${product.id}`);
    }

  }
};

//* This function recives an array of products (keepa + orders), calculates the fees and saves on the database the complete tracked products
const processBatch = async (req, res, next, productBatch, combinedData, BATCH_SIZE_FEES, batchIndex) => {
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
    logger.error(`getEstimateFees failed for batch ${batchIndex + 1}: ${error.message}`);
  }

  logger.info(`Start proccess of combining data keepa + orders + fees to generete the complete tracked product`);

  const productCosts = await Product.findAll({
    where: {
      id: productBatch.map((product) => product.id),
    },
    attributes: ['id', 'product_cost'],
  }).catch((error) => {
    throw new Error(`Product.findAll failed for product costs in batch ${batchIndex + 1}: ${error.message}`);
  });

  const costMap = productCosts.reduce((acc, product) => {
    acc[product.id] = product.product_cost;
    return acc;
  }, {});

  const finalData = feeEstimates.map((feeEstimate) => {
    // const combinedItem = combinedData.find((item) => item.product_id === feeEstimate.product_id).catch((error) => {
    //   logger.error(`Error finding combined item for product id ${feeEstimate.product_id}: ${error.message}`);
    // })
    const combinedItem = combinedData.find((item) => item.product_id === feeEstimate.product_id);
    const fees = feeEstimate.fees || 0;
    const productCost = costMap[feeEstimate.product_id] || 0;
    const profit = combinedItem.lowest_fba_price - fees - productCost;

    return {
      ...combinedItem,
      fees: fees,
      profit: profit,
      updatedAt: new Date(),
    };
  });

  logger.info(`finish proccess of combining data keepa + orders + fees to generete the complete tracked product`);
  logger.info(`Saving the tracked products for batch ${batchIndex + 1}...`);

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
      'updatedAt',
    ],
  })
    .then((instances) => {
      logger.info(`TrackedProduct.bulkCreate succeeded for batch ${batchIndex + 1}. ${instances.length} records saved.`);
    })
    .catch((error) => {
      logger.error(`TrackedProduct.bulkCreate failed for batch ${batchIndex + 1}: ${error.message}`);
      throw new Error(`TrackedProduct.bulkCreate failed for batch ${batchIndex + 1}: ${error.message}`);
    });
};

const addAccessTokenAndProcessBatch = async (req, res, productBatch, combinedData, batch_size_fees, batchIndex) => {

  console.log('--------------------------------------')
  console.log('fetching new token for fees...');
  let accessToken = await fetchNewTokenForFees();
  console.log(accessToken);
  console.log('--------------------------------------')

  try {
    if (!accessToken) {
      console.log('Fetching new token...');
      logger.info('Fetching new token...');
      accessToken = await fetchNewTokenForFees();
    } else {
      console.log('Token is still valid...');
      logger.info('Token is still valid...');
    }

    req.headers['x-amz-access-token'] = accessToken;

    // Ejecuta el método processBatch y espera a que termine
    await processBatch(req, res, null, productBatch, combinedData, batch_size_fees, batchIndex);
  } catch (error) {
    console.error('Error fetching access token or processing batch:', error);
    logger.error('Error fetching access token or processing batch:', error);
    // throw error;
  }
};

const getNewAccessToken = async () => {
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
    logger.info(`New access token obtained: ${data.access_token}`);
    return data.access_token;
  } catch (err) {
    logger.error('Error refreshing token:', err);
    throw new Error('Failed to refresh token');
  }
};

async function fixUntrackedProducts(untrackedProductIds, fixedProducts, unfixedProducts) {
  for (const productId of untrackedProductIds) {
    try {
      // 1. Buscar el asin del producto no trackeado
      const untrackedProduct = await Product.findOne({ where: { id: productId } });


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