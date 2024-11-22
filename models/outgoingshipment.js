'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class OutgoingShipment extends Model {
    static associate(models) {
      OutgoingShipment.belongsToMany(models.PalletProduct, {
        through: models.OutgoingShipmentProduct,
        foreignKey: 'outgoing_shipment_id',
        otherKey: 'pallet_product_id',
      });
    }

  }

  OutgoingShipment.init(
    {
      shipment_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'PENDING'
      },
    },
    {
      sequelize,
      modelName: 'OutgoingShipment',
    }
  );

  return OutgoingShipment;
};
