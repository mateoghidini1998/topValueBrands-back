const { Product, TrackedProduct } = require("../models");
const axios = require("axios");
const asyncHandler = require("../middlewares/async");
const { generateOrderReport } = require("../utils/utils");
const dotenv = require("dotenv");
const logger = require("../logger/logger");

dotenv.config({ path: "./env" });

const LIMIT_PRODUCTS = 20;
const GROUPS_ASINS = 20;
const MS_DELAY_KEEPA = 15000; // 10 seconds

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//  Obtenemos los productos que queremos trackear
const fetchProducts = async ({ limit = LIMIT_PRODUCTS, offset = 0 }) => {
  return await Product.findAll({ limit, offset });
};

//  Función para obtener los datos de Keepa
const getKeepaData = async (asinGroup) => {
  if (!asinGroup) logger.error("No ASIN group provided");
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) logger.error("No API key provided");
  const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1&offers=20`;
  const response = await axios.get(url);
  if (!response.data) {
    logger.error("No data received from Keepa");
    throw new Error("No data received from Keepa");
  }
  console.log(response.data.products.length);
  logger.info(
    `Data received from Keepa: ${response.data.products.length} products`
  );
  return response.data;
};

//  Función para guardar los datos en la tabla de TrackedProduct
const saveProductData = async (data) => {
  if (!data) logger.error("No data provided");
  try {
    await TrackedProduct.bulkCreate(data, {
      updateOnDuplicate: [
        "current_rank",
        "thirty_days_rank",
        "ninety_days_rank",
        "lowest_fba_price",
      ],
    });
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
    });
  }
};

exports.getProductsTrackedData = asyncHandler(async (req, res, next) => {
  // 1. Obtenemos los productos
  const products = await fetchProducts({ limit: LIMIT_PRODUCTS });
  logger.info(
    `Starting getProductsTrackedData with ${products.length} products`
  );
  logger.info(
    `Groups of ${GROUPS_ASINS} ASINs will be processed in batches of ${GROUPS_ASINS} products`
  );
  logger.info(`MS_DELAY_KEEPA: ${MS_DELAY_KEEPA}`);
  const asinGroups = [];

  // 2. Dividimos los ASINs de los productos en grupos
  for (let i = 0; i < products.length; i += GROUPS_ASINS) {
    const group = products
      .slice(i, i + GROUPS_ASINS)
      .map((product) => product.ASIN)
      .join(",");
    asinGroups.push(group);
  }

  // 3. Obtenemos los datos de Keepa para cada grupo de ASINs y los guardamos en la tabla trackedproducts
  for (const asinGroup of asinGroups) {
    console.log("getting keepadata for", asinGroup);
    const keepaDataResponse = await getKeepaData(asinGroup);

    if (!keepaDataResponse) {
      throw new Error("No data received from Keepa");
    }

    const processedData = keepaDataResponse.products.map((product) => {
      // Buscamos el producto que coincida con el ASIN
      const matchingProduct =
        products.find((p) => p.ASIN === product.asin) || {};

      // Obtenemos el lowest_fba_price
      let lowest_fba_price =
        product.stats.current[10] > 0
          ? product.stats.current[10]
          : product.stats.current[7] > 0
          ? product.stats.current[7]
          : product.stats.buyBoxPrice;

      // Creamos un objeto con los datos procesados
      return {
        product_id: matchingProduct.id,
        current_rank: product.stats.current[3],
        thirty_days_rank: product.stats.avg30[3],
        ninety_days_rank: product.stats.avg90[3],
        lowest_fba_price,
      };
    });

    // 6. Guardamos los datos en la tabla
    await saveProductData(processedData);
    // Delay entre API calls de Keepa para evitar el bloqueo de la API
    await delay(MS_DELAY_KEEPA);
  }
});

const addProductVelocityAndUnitsSoldToTrackedProducts = async (data) => {
  logger.info("Executing addProductVelocityAndUnitsSoldToTrackedProducts...");

  // 1. Obtenemos todos los tracked products

  // 2. bla bla
};

exports.addProductVelocityAndUnitsSold = asyncHandler(
  async (req, res, next) => {
    logger.info("Executing addProductVelocity...");

    // 1. Obtenemos todos los tracked products
    const products = await TrackedProduct.findAll();
    logger.info("TrackedProducts found: " + products.length);
    if (!products) {
      throw new Error("No tracked products found");
    }

    // 2. Generamos el reporte de orders
    const jsonData = await generateOrderReport(req, res, next);
    if (!jsonData) {
      throw new Error("Failed to retrieve orders");
    }

    const filteredOrders = jsonData.filter(
      (item) =>
        (item["order-status"] === "Shipped" ||
          item["order-status"] === "Pending") &&
        new Date() - new Date(item["purchase-date"]) <= 30 * 24 * 60 * 60 * 1000
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

    // 3. Agregamos los datos de product velocity y units sold a los tracked products
    // METODO PARA ACTUALIZAR LOS PRODUCTS.
  }
);
