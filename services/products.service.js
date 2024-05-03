const { Product } = require('../models');
const {Op} = require('sequelize');

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

      const data = await Product.findAndCountAll({
        where: query,
        ...queries
      })


      const res = {
        totalPages: Math.ceil(data?.count / limit),
        totalItems: data?.count,
        data: data?.rows
      }

      resolve(res);

    } catch (error) {
      console.error({ msg: error.message });
   }
  })
}