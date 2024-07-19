const { Product, TrackedProduct } = require('../../models');
const logger = require('../../logger/logger');

// Function to fix untracked products
// fixUntrackedProducts.js

// Example to test the function

const untrackedProductIds = [
  244,
  5,
  1274,
  10,
  796,
  41,
  1888,
  47,
  1463,
  81,
  987,
  187,
  1066,
  221,
  1164,
  233,
  1419,
  243,
  1369,
  272,
  1312,
  293,
  837,
  555,
  336,
  1604,
  338,
  765,
  430,
  839,
  442,
  1895,
  465,
  993,
  571,
  798,
  655,
  1707,
  675,
  1464,
  688,
  1762,
  689,
  962,
  698,
  1324,
  727,
  1455,
  743,
  1141,
  793,
  890,
  820,
  1439,
  821,
  1673,
  849,
  1691,
  948,
  1393,
  952,
  973,
  968,
  1450,
  1029,
  1334,
  1119,
  1602,
  1148,
  1920,
  1206,
  1698,
  1367,
  1579,
  1374,
  1936,
  1459,
  1711,
  1523,
  1750,
  1556,
  1738,
  1686

];

async function fixUntrackedProducts(untrackedProductIds) {
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

        const newTrackedProduct = await TrackedProduct.create(newTrackedProductData);
        logger.info(`TrackedProduct.create successful: ${JSON.stringify(newTrackedProduct)}`);
      }
    } catch (error) {
      logger.error(`Error fixing product with ID ${productId}: ${error.message}`);
    }
  }
}

async function runFixUntrackedProducts() {
  try {
    await fixUntrackedProducts(untrackedProductIds);
    logger.info('Fixed products process completed.');
  } catch (error) {
    logger.error(`Error in fixing process: ${error.message}`);
  }
}

// Llamar a la función para ejecutar la corrección
runFixUntrackedProducts();

module.exports = { fixUntrackedProducts };
