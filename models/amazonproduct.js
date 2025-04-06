'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AmzProduct extends Model {
    static associate(models) {
      AmzProduct.hasMany(models.AmzTrackedProduct, {
        foreignKey: 'amz_product_id',
        as: 'amztrackedproducts',
      });
      AmzProduct.belongsTo(models.Product, {
        foreignKey: 'product_id',
        as: 'product',
      });
    }
  }
  AmzProduct.init(
    {
      ASIN: DataTypes.STRING,
      amz_product_image: DataTypes.STRING,
      amz_product_name: DataTypes.STRING,
      amz_seller_sku: DataTypes.STRING,
      FBA_available_inventory: DataTypes.INTEGER,
      reserved_quantity: DataTypes.INTEGER,
      Inbound_to_FBA: DataTypes.INTEGER,
      upc: DataTypes.STRING,
      pack_type: DataTypes.STRING,
      dangerous_goods: DataTypes.STRING,
      in_seller_account: DataTypes.BOOLEAN,
      is_active: DataTypes.BOOLEAN,

      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'amz_product',
    }
  );
  return AmzProduct;
};
