'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PurchaseOrder extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      PurchaseOrder.belongsTo(models.Supplier, { foreignKey: 'supplier_id', as: 'suppliers' });
      PurchaseOrder.belongsTo(models.PurchaseOrderStatus, { foreignKey: 'purchase_order_status_id', as: 'purchaseOrderStatus' });
      PurchaseOrder.hasMany(models.PurchaseOrderProduct, { foreignKey: 'purchase_order_id', as: 'purchaseOrderProducts' });
    }
  }
  PurchaseOrder.init({
    order_number: DataTypes.STRING,
    supplier_id: DataTypes.INTEGER,
    purchase_order_status_id: DataTypes.INTEGER,
    total_price: DataTypes.DECIMAL,
    notes: DataTypes.STRING,
    incoming_order_notes: DataTypes.STRING,
    is_active: DataTypes.BOOLEAN,
    updatedStatusAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'PurchaseOrder',
  });
  return PurchaseOrder;
};