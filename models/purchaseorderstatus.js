'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PurchaseOrderStatus extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      PurchaseOrderStatus.hasMany(models.PurchaseOrder, {
        foreignKey: 'purchase_order_status_id',
        as: 'purchaseOrders'
      });
    }
  }
  PurchaseOrderStatus.init({
    description: DataTypes.ENUM('Rejected', 'Pending', 'Good to go', 'Cancelled', 'In transit', 'Arrived', 'Closed', 'Waiting for supplier approval')
  }, {
    sequelize,
    modelName: 'PurchaseOrderStatus',
    tableName: 'PurchaseOrderStatus',
  });
  return PurchaseOrderStatus;
};