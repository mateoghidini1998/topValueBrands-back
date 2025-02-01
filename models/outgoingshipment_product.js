'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class OutgoingShipmentProduct extends Model {
    static associate(models) {
      // Definir relaciones con los modelos OutgoingShipment y PurchaseOrderProduct
      OutgoingShipmentProduct.belongsTo(models.OutgoingShipment, {
        foreignKey: 'outgoing_shipment_id',
        onDelete: 'CASCADE', 
      });
      OutgoingShipmentProduct.belongsTo(models.PalletProduct, {
        as: 'palletProduct',
        foreignKey: 'pallet_product_id',
        onDelete: 'CASCADE',
      });
    }
  }

  OutgoingShipmentProduct.init(
    {
      id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },      
      outgoing_shipment_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      pallet_product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      is_checked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: 'OutgoingShipmentProduct',
    }
  );

  return OutgoingShipmentProduct;
};
