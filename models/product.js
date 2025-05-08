'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      Product.hasMany(models.TrackedProduct, {
        foreignKey: 'product_id',
        as: 'trackedproducts',
      });

      Product.belongsTo(models.Supplier, {
        foreignKey: 'supplier_id',
        as: 'supplier',
      });

      Product.hasMany(models.PurchaseOrderProduct, {
        foreignKey: 'product_id',
        as: 'purchaseorderproducts',
      });

      Product.hasOne(models.AmazonProductDetail, {
        foreignKey: 'product_id',
        as: 'AmazonProductDetail',
      });
      Product.hasOne(models.WalmartProductDetail, {
        foreignKey: 'product_id',
        as: 'WalmartProductDetail',
      });
      
    }
  }
  Product.init(
    {
      product_image: DataTypes.STRING,
      product_name: DataTypes.STRING,
      warehouse_stock: DataTypes.INTEGER,
      supplier_id: DataTypes.INTEGER,
      supplier_item_number: DataTypes.STRING,
      upc: DataTypes.STRING,
      product_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      pack_type: DataTypes.STRING,
      is_active: DataTypes.BOOLEAN,
      in_seller_account: DataTypes.BOOLEAN,
    },
    {
      sequelize,
      modelName: 'Product',
    }
  );
  return Product;
};
