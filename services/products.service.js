const { Product, TrackedProduct } = require('../models');
const { Op } = require('sequelize');
const redisClient = require('../redis/redis');
const logger = require('../logger/logger')

exports.productService = {
  findAll: ({ page, limit, orderBy, sortBy, keyword }) => new Promise(async (resolve, reject) => {
    try {
      const queries = {
        offset: (page - 1) * limit,
        limit,
      }

      const query = {}

      if (keyword) {
        query[Op.or] = [
          {
            product_name: {
              [Op.like]: `%${keyword}%`
            }
          },
          {
            ASIN: {
              [Op.like]: `${keyword}%`
            }
          }
        ]
      }

      if (orderBy) {
        queries.order = [[orderBy, sortBy]]
      }

      // Genera una clave única para el caché basado en los parámetros de consulta
      const cacheKey = `products_${page}_${limit}_${orderBy}_${sortBy}_${keyword}`;

      // Intenta obtener los datos del caché
      redisClient.get(cacheKey, async (err, cachedData) => {
        if (err) {
          console.error('Error fetching from cache:', err);
          return reject(err);
        }

        if (cachedData) {
          console.log('Data from CACHE');
          logger.info('DATA FROM CACHE')
          return resolve(JSON.parse(cachedData));
        }

        console.log('Data from DB');
        logger.info('DATA FROM DB')

        // Realiza la consulta a la base de datos
        const data = await Product.findAndCountAll({
          where: query,
          ...queries
        })

        const res = {
          totalPages: Math.ceil(data?.count / limit),
          totalItems: data?.count,
          data: data?.rows
        }

        // Guarda los resultados en el caché con una expiración de 1 hora
        redisClient.setEx(cacheKey, 3600, JSON.stringify(res));

        resolve(res);
      });

    } catch (error) {
      console.error({ msg: error.message });
      reject(error);
    }
  })
}

exports.toggleProductActivation = async (seller_sku) => {
  const product = await Product.findOne({ where: { seller_sku } });
  if (!product) return { success: false, message: 'Product not found' };

  const trackedProduct = await TrackedProduct.findOne({ where: { product_id: productId } });

  product.is_active = !product.is_active;
  await product.save();

  if (trackedProduct) {
    trackedProduct.is_active = !trackedProduct.is_active;
    await trackedProduct.save();
  }

  return { success: true, data: product };
};