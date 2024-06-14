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
    data: trackedProducts,
  });
});

//@route GET api/v1/pogenerator/trackedproducts
//@desc  Track products and save them into db from keepa api data and order reports from AMZ API.
//@access Private
exports.generateTrackedProductsData = asyncHandler(async (req, res, next) => {
  try {
    const [orderData, keepaData] = await Promise.all([
      saveOrders(req, res, next),
      getProductsTrackedData(req, res, next),
    ]);

    const orderItems = orderData;
    const keepaItems = keepaData;

    const combinedData = keepaItems.map((keepaItem) => {
      const orderItem =
        orderItems.find((o) => o.product_id === keepaItem.product_id) || {};
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

    await TrackedProduct.bulkCreate(combinedData);

    // Llamada a getEstimateFees después de que los tracked products se hayan guardado
    const feeEstimates = await getEstimateFees(req, res, next);
    console.log('FEE ESTIMATES: ', feeEstimates);

    // Actualizar las filas de los tracked products con los fees
    feeEstimates.forEach(async (feeEstimate) => {
      await TrackedProduct.update(
        { fees: feeEstimate.fees },
        { where: { product_id: feeEstimate.product_id } }
      );
    });

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
const getProductsTrackedData = async (req, res, next) => {
  try {
    const products = await Product.findAll({ limit: 40 });

    const asinGroups = [];
    for (let i = 0; i < products.length; i += 20) {
      const group = products
        .slice(i, i + 20)
        .map((product) => product.ASIN)
        .join(',');
      asinGroups.push(group);
    }
    console.log('ASIN groups:', asinGroups);

    const keepaResponses = [];
    for (const asinGroup of asinGroups) {
      const keepaDataResponse = await getKeepaData(asinGroup);
      console.log('Keepa data response:', keepaDataResponse);
      keepaResponses.push(keepaDataResponse);

      await new Promise((resolve) => setTimeout(resolve, 65000));
    }

    const processedData = keepaResponses.flatMap((response) =>
      response.products.map((product) => {
        const matchingProduct = products.find((p) => p.ASIN === product.asin);
        let lowestPrice = null;

        if (product.stats.buyBoxPrice <= 0) {
          if (product.stats.current[10] <= 0) {
            lowestPrice = product.stats.current[7];
          } else {
            lowestPrice = product.stats.current[10];
          }
        } else {
          lowestPrice = product.stats.buyBoxPrice;
        }

        return {
          product_id: matchingProduct.id,
          currentSalesRank: product.stats.current[3],
          avg30: product.stats.avg30[3],
          avg90: product.stats.avg90[3],
          lowestFbaPrice: lowestPrice,
        };
      })
    );
    console.log(processedData);
    return processedData;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw new Error('Error fetching data from Keepa.');
  }
};

//Function to retrieve sales ranks from keepa API. Each request receives a group of 20 ASINs
const getKeepaData = async (asinGroup) => {
  const apiKey = process.env.KEEPA_API_KEY;
  const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1&offers=20`;
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
    console.error(
      'Error fetching data for ASIN group:',
      asinGroup,
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};

const saveOrders = asyncHandler(async (req, res, next) => {
  const jsonData = await generateOrderReport(req, res, next);

  if (!jsonData) {
    throw new Error('Failed to retrieve orders');
  }

  const filteredOrders = jsonData.filter(
    (item) =>
      item['order-status'] === 'Shipped' &&
      new Date() - new Date(item['purchase-date']) <= 30 * 24 * 60 * 60 * 1000
  );

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

  const finalJson = Object.entries(skuQuantities).map(
    ([sku, { quantity, asin }]) => ({
      sku,
      product_id: asinToProductId[asin],
      quantity,
      velocity: quantity / 30,
    })
  );

  return finalJson;
});

const getEstimateFees = asyncHandler(async (req, res, next) => {
  const products = await Product.findAll({ limit: 40 });

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

      // Esperar 5 segundos entre cada solicitud
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      try {
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
      } catch (error) {
        console.error(
          `Error fetching fees for ASIN ${product.ASIN}:`,
          error.response.data
        );
        throw new Error('Error fetching fees.');
      }
    })
  );

  return feeEstimate;
});
