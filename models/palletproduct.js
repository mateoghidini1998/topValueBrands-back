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
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },    
    purchaseorderproduct_id: DataTypes.INTEGER,
    pallet_id: DataTypes.INTEGER,
    quantity: DataTypes.INTEGER,
    available_quantity: DataTypes.INTEGER,
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    }
  }, {
    sequelize,
    modelName: 'PalletProduct',
  });
  return PalletProduct;
};