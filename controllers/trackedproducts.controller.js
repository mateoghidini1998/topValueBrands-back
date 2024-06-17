const { Product, TrackedProduct, Supplier } = require('../models');
const axios = require('axios');
const asyncHandler = require('../middlewares/async');
const { generateOrderReport } = require('../utils/utils');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const fetchProducts = async (limit = 40) => {
  return await Product.findAll({ limit });
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//@route GET api/v1/pogenerator/trackedproducts
//@desc  Get all tracked products
//@access Private
exports.getTrackedProducts = asyncHandler(async (req, res, next) => {
  const trackedProducts = await TrackedProduct.findAll({
    include: [
      {
        model: Product,
        as: 'product',
        attributes: ['product_name', 'ASIN', 'seller_sku', 'supplier_id'],
        include: [
          {
            model: Supplier,
            as: 'supplier',
            attributes: ['supplier_name'],
          },
        ],
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: trackedProducts,
  });
});

//@route GET api/v1/pogenerator/trackedproducts
//@desc  Track products and save them into db from keepa api data and order reports from AMZ API.
//@access Private
exports.generateTrackedProductsData = asyncHandler(async (req, res, next) => {
  try {
    const products = await fetchProducts(40);

    const [orderData, keepaData] = await Promise.all([
      saveOrders(req, res, next, products),
      getProductsTrackedData(products),
    ]);

    const combinedData = keepaData.map((keepaItem) => {
      const orderItem =
        orderData.find((o) => o.product_id === keepaItem.product_id) || {};
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
        lowest_fba_price: lowestFbaPriceInDollars,
      };
    });

    // Perform the bulk create with upsert
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

    const feeEstimates = await getEstimateFees(req, res, next, products);

    // Batch update fees to minimize database transactions
    const updatePromises = feeEstimates.map((feeEstimate) => {
      return TrackedProduct.update(
        { fees: feeEstimate.fees },
        { where: { product_id: feeEstimate.product_id } }
      );
    });

    await Promise.all(updatePromises);

    return res.status(200).json({
      message: 'Data combined and saved successfully.',
      data: combinedData,
    });
  } catch (error) {
    console.error('Error combining and saving data:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Error combining and saving data.' });
  }
});

//Function to group asins into groups of 20
const getProductsTrackedData = async (products) => {
  const asinGroups = [];

  for (let i = 0; i < products.length; i += 20) {
    const group = products
      .slice(i, i + 20)
      .map((product) => product.ASIN)
      .join(',');
    asinGroups.push(group);
  }

  const keepaResponses = [];
  for (const asinGroup of asinGroups) {
    const keepaDataResponse = await getKeepaData(asinGroup);
    keepaResponses.push(keepaDataResponse);
    await delay(65000); // Delay between API calls
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
  const feeEstimate = await Promise.all(
    products.map(async (product, index) => {
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

      if (index > 0) {
        await delay(5000);
      }

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
