'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PurchaseOrderProduct extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      PurchaseOrderProduct.belongsTo(models.PurchaseOrder, {foreignKey: 'purchase_order_id'});
      PurchaseOrderProduct.belongsTo(models.Product, {foreignKey: 'product_id'});
    }
  }
  PurchaseOrderProduct.init({
    purchase_order_id: DataTypes.INTEGER, 
    product_id: DataTypes.INTEGER,
    price: DataTypes.DECIMAL,
    quantity: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'PurchaseOrderProduct',
  });
  return PurchaseOrderProduct;
};