const { Product, TrackedProduct } = require('../models');
const axios = require('axios');
const asyncHandler = require('../middlewares/async');
const { generateOrderReport } = require('../utils/utils');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

//@route GET api/v1/pogenerator/trackedproducts
//@desc  Get all tracked products
//@access Private
exports.getTrackedProducts = asyncHandler(async (req, res, next) => {
    const trackedProducts = await TrackedProduct.findAll();
    res.status(200).json({
        success: true,
        data: trackedProducts
    });
});

//@route GET api/v1/pogenerator/trackedproducts
//@desc  Track products and save them into db from keepa api data and order reports from AMZ API.
//@access Private
exports.generateTrackedProductsData = asyncHandler(async (req, res, next) => {
  try {
    const [orderData, keepaData] = await Promise.all([
      saveOrders(req, res, next),
      getProductsTrackedData(req, res, next)
    ]);

    const orderItems = orderData;
    const keepaItems = keepaData;

    const combinedData = keepaItems.map(keepaItem => {
      const orderItem = orderItems.find(o => o.product_id === keepaItem.product_id) || {};
      const unitsSold = orderItem.quantity || 0;
      const productVelocity = orderItem.velocity || 0;

      return {
        product_id: keepaItem.product_id,
        current_rank: keepaItem.currentSalesRank || null,
        thirty_days_rank: keepaItem.avg30 || null,
        ninety_days_rank: keepaItem.avg90 || null,
        units_sold: unitsSold,
        product_velocity: productVelocity
      };
    });

    await TrackedProduct.bulkCreate(combinedData);

    return res.status(200).json({
      message: 'Data combined and saved successfully.',
      data: combinedData
    });
  } catch (error) {
    console.error('Error combining and saving data:', error);
    return res.status(500).json({ success: false, message: 'Error combining and saving data.' });
  }
});

//Function to group asins into groups of 20
const getProductsTrackedData = async (req, res, next) => {
  try {
    const products = await Product.findAll({ limit: 40 });
    console.log('Fetched products:', products);

    const asinGroups = [];
    for (let i = 0; i < products.length; i += 20) {
      const group = products.slice(i, i + 20).map(product => product.ASIN).join(',');
      asinGroups.push(group);
    }
    console.log('ASIN groups:', asinGroups);

    const keepaResponses = [];
    for (const asinGroup of asinGroups) {
      const keepaDataResponse = await getKeepaData(asinGroup);
      console.log('Keepa data response:', keepaDataResponse);
      keepaResponses.push(keepaDataResponse);

      await new Promise(resolve => setTimeout(resolve, 65000));
    }

    const processedData = keepaResponses.flatMap(response => response.products.map(product => {
      const matchingProduct = products.find(p => p.ASIN === product.asin);
      return {
        product_id: matchingProduct.id,
        currentSalesRank: product.stats.current[3],
        avg30: product.stats.avg30[3],
        avg90: product.stats.avg90[3]
      };
    }));

    return processedData;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw new Error('Error fetching data from Keepa.');
  }
};

//Function to retrieve sales ranks from keepa API. Each request receives a group of 20 ASINs
const getKeepaData = async (asinGroup) => {
    const apiKey = process.env.KEEPA_API_KEY;
    const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1`;
    console.log(url);
    try {
        console.log('Fetching data from Keepa for ASIN group:', asinGroup);
        const response = await axios.get(url);
        console.log('Response from Keepa:', response.data);
        if (!response.data) {
            throw new Error('No data received from Keepa');
        }
        return response.data;
    } catch (error) {
        console.error('Error fetching data for ASIN group:', asinGroup, error.response ? error.response.data : error.message);
        throw error;
    }
};

const saveOrders = asyncHandler(async (req, res, next) => {
  const jsonData = await generateOrderReport(req, res, next);

  if (!jsonData) {
    throw new Error('Failed to retrieve orders');
  }

  const filteredOrders = jsonData.filter(item => item['order-status'] === 'Shipped' && new Date() - new Date(item['purchase-date']) <= 30 * 24 * 60 * 60 * 1000);

  const skuQuantities = {};
  for (let item of filteredOrders) {
    const { sku, quantity, asin } = item;

    const qty = parseInt(quantity, 10);
    if (!skuQuantities[sku]) {
      skuQuantities[sku] = { quantity: qty, asin };
    } else {
      skuQuantities[sku].quantity += qty;
    }
  }

  const products = await Product.findAll();
  const asinToProductId = products.reduce((acc, product) => {
    acc[product.ASIN] = product.id;
    return acc;
  }, {});

  const finalJson = Object.entries(skuQuantities).map(([sku, { quantity, asin }]) => ({
    sku,
    product_id: asinToProductId[asin],
    quantity,
    velocity: quantity / 30
  }));

  return finalJson;
});
  

  