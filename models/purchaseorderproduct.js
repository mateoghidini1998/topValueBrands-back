'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PurchaseOrderProduct extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      PurchaseOrderProduct.belongsTo(models.PurchaseOrder, {
        foreignKey: 'purchase_order_id',
      });
      PurchaseOrderProduct.belongsTo(models.Product, {
        foreignKey: 'product_id',
      });
      PurchaseOrderProduct.belongsTo(models.PurchaseOrderProductReason, {
        foreignKey: 'reason_id',
      });

      PurchaseOrderProduct.belongsToMany(models.OutgoingShipment, {
        through: models.OutgoingShipmentProduct,
        foreignKey: 'purchase_order_product_id',
        otherKey: 'outgoing_shipment_id',
      });
      
      PurchaseOrderProduct.belongsToMany(models.Pallet, {
        through: models.PalletProduct,
        foreignKey: 'purchaseorderproduct_id',
        otherKey: 'pallet_id',
        as: 'pallets'
      });
      
      
    }

  }
  PurchaseOrderProduct.init(
    {
      purchase_order_id: DataTypes.INTEGER,
      product_id: DataTypes.INTEGER,
      unit_price: DataTypes.DECIMAL,
      total_amount: DataTypes.DECIMAL,
      quantity_purchased: DataTypes.INTEGER,
      quantity_received: DataTypes.INTEGER,
      quantity_missing: DataTypes.INTEGER,
      quantity_available: DataTypes.INTEGER,
      reason_id: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: 'PurchaseOrderProduct',
    }
  );
  return PurchaseOrderProduct;
};
