'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      Product.hasMany(models.AmzProduct, {
        foreignKey: 'product_id',
        as: 'amzproducts',
      });
      Product.hasMany(models.WalmartProduct, {
        foreignKey: 'product_id',
        as: 'walmartproducts',
      });
      Product.hasMany(models.PurchaseOrderProduct, {
        foreignKey: 'product_id',
        as: 'purchaseorderproducts',
      });
      Product.belongsTo(models.ProductsSupplier, {
        foreignKey: 'supplier_id',
        as: 'supplier',
      });

    }
  }
  Product.init(
    {
      product_image: DataTypes.STRING,
      product_name: DataTypes.STRING,
      product_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      warehouse_stock: DataTypes.INTEGER,
      is_active: DataTypes.BOOLEAN,
    },
    {
      sequelize,
      modelName: 'Product',
    }
  );
  return Product;
};
