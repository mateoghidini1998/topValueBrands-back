const { Product } = require('../models');
const { Op } = require('sequelize');
const redisClient = require('../redis/redis');

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
          console.log('Cache hit');
          return resolve(JSON.parse(cachedData));
        }

        console.log('Cache miss');

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
        redisClient.setex(cacheKey, 3600, JSON.stringify(res));

        resolve(res);
      });

    } catch (error) {
      console.error({ msg: error.message });
      reject(error);
    }
  })
}