'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class WalmartProduct extends Model {
    static associate(models) {
      // WalmartProduct.hasMany(models.AmzTrackedProduct, {
      //   foreignKey: 'amz_product_id',
      //   as: 'amztrackedproducts',
      // });
      WalmartProduct.belongsTo(models.Product, {
        foreignKey: 'product_id',
        as: 'product',
      });
    }
  }
  WalmartProduct.init(
    {
      walmart_seller_sku: DataTypes.STRING,
      gtin: DataTypes.STRING,
      upc: DataTypes.STRING,
      walmart_product_name: DataTypes.STRING,
      pack_type: DataTypes.STRING,
      price: DataTypes.INTEGER,
      availableToSellQty: DataTypes.INTEGER,
      is_active: DataTypes.BOOLEAN,

      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

    },
    {
      sequelize,
      modelName: 'walmart_product',
    }
  );
  return WalmartProduct;
};
