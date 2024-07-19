const { Product, TrackedProduct, Supplier } = require('../models');
const axios = require('axios');
const asyncHandler = require('../middlewares/async');
const { generateOrderReport } = require('../utils/utils');
const dotenv = require('dotenv');
const logger = require('../logger/logger');

dotenv.config({ path: './env' })

const LIMIT_PRODUCTS = 20;
const GROUPS_ASINS = 20;
const MS_DELAY_KEEPA = 15000; // 10 seconds

const fetchProducts = async ({ limit = LIMIT_PRODUCTS, offset = 0 }) => {
  return await Product.findAll({ limit, offset });
};

const getKeepaData = async (asinGroup) => {
  const apiKey = process.env.KEEPA_API_KEY;
  const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1&offers=20`;
  const response = await axios.get(url);
  if (!response.data) {
    throw new Error('No data received from Keepa');
  }
  return response.data;
};

const saveProductData = async (data) => {
      try {
        await TrackedProduct.bulkCreate(data, {
          updateOnDuplicate: [
            'current_rank',
            'thirty_days_rank',
            'ninety_days_rank',
            'lowest_fba_price',
          ]
        })
      } catch (error) {
        console.error(error.message)
      }
};

exports.getProductsTrackedData = asyncHandler(async(req, res, next) => {
  const products = await fetchProducts({ limit: LIMIT_PRODUCTS });
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

  for (const asinGroup of asinGroups) {
    console.log('getting keepadata for', asinGroup);
    const keepaDataResponse = await getKeepaData(asinGroup);

    const processedData = keepaDataResponse.products.map((product) => {
      const matchingProduct = products.find((p) => p.ASIN === product.asin) || {};

      let lowest_fba_price =
        product.stats.buyBoxPrice > 0
          ? product.stats.buyBoxPrice
          : product.stats.current[10] > 0
            ? product.stats.current[10]
            : product.stats.current[7];

      return {
        product_id: matchingProduct.id,
        current_rank: product.stats.current[3],
        thirty_days_rank: product.stats.avg30[3],
        ninety_days_rank: product.stats.avg90[3],
        lowest_fba_price
      };
    });
    
    await saveProductData(processedData);
    await delay(MS_DELAY_KEEPA); 
  }

});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


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