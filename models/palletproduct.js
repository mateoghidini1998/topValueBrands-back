'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PalletProduct extends Model {
    static associate(models) {
      PalletProduct.belongsTo(models.PurchaseOrderProduct, {
        as: 'purchaseOrderProduct',
        foreignKey: 'purchaseorderproduct_id',
      })
      PalletProduct.belongsTo(models.Pallet, {
        foreignKey: 'pallet_id'
      })
    }
  }
  PalletProduct.init({
    purchaseorderproduct_id: DataTypes.INTEGER,
    pallet_id: DataTypes.INTEGER,
    quantity: DataTypes.INTEGER,
    available_quantity: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'PalletProduct',
  });
  return PalletProduct;
};