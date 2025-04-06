'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ProductSupplier extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      PurchaseOrderProduct.hasMany(models.Product, {
        foreignKey: 'product_id',
        as: 'products',
      });
      PurchaseOrderProduct.hasMany(models.Supplier, {
        foreignKey: 'supplier_id',
        as: 'suppliers',
      });
    }
  }
  ProductSupplier.init(
    {
      product_id: DataTypes.INTEGER,
      purchase_order_id: DataTypes.INTEGER,
      supplier_id: DataTypes.INTEGER,
      supplier_item_number: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: 'ProductSupplier',
    }
  );
  return ProductSupplier;
};
