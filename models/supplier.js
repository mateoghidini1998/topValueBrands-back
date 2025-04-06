'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Supplier extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Supplier.hasMany(models.ProductSupplier, {
        foreignKey: 'supplier_id',
        as: 'ProductSupplier'
      });

      Supplier.hasMany(models.PurchaseOrder, {
        foreignKey: 'supplier_id',
        as: 'purchaseOrders'
      })
    }
  }
  Supplier.init({
    supplier_name: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Supplier',
  });
  return Supplier;
};