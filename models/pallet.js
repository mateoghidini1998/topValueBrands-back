'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Pallet extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Pallet.belongsTo(models.WarehouseLocation, {
        foreignKey: 'warehouse_location_id',
        as: 'warehouseLocation'
      })
      Pallet.belongsTo(models.PurchaseOrder, {
        foreignKey: 'purchase_order_id',
        as: 'purchaseOrder'
      })
      Pallet.belongsToMany(models.PurchaseOrderProduct, {
        through: models.PalletProduct,
        foreignKey: 'pallet_id',
        otherKey: 'purchaseorderproduct_id',
        as: 'purchaseorderproducts'
      });
      
      
    }
  }
  Pallet.init({
    pallet_number: DataTypes.STRING,
    warehouse_location_id: DataTypes.INTEGER,
    purchase_order_id: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Pallet',
  });
  return Pallet;
};