'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class OutgoingShipment extends Model {
    static associate(models) {
      OutgoingShipment.belongsToMany(models.PurchaseOrderProduct, {
        through: models.OutgoingShipmentProduct,
        foreignKey: 'outgoing_shipment_id',
        otherKey: 'purchase_order_product_id',
      });
    }

  }

  OutgoingShipment.init(
    {
      shipment_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'OutgoingShipment',
    }
  );

  return OutgoingShipment;
};
