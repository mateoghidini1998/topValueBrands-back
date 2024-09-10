'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class OutgoingShipmentProduct extends Model {
    static associate(models) {
      // Definir relaciones con los modelos OutgoingShipment y PurchaseOrderProduct
      OutgoingShipmentProduct.belongsTo(models.OutgoingShipment, {
        foreignKey: 'outgoing_shipment_id',
        onDelete: 'CASCADE', // Configuración opcional para borrar en cascada
      });
      OutgoingShipmentProduct.belongsTo(models.PurchaseOrderProduct, {
        foreignKey: 'purchase_order_product_id',
        onDelete: 'CASCADE',
      });
    }
  }

  OutgoingShipmentProduct.init(
    {
      outgoing_shipment_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      purchase_order_product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1, // Valor por defecto de la cantidad
      },
    },
    {
      sequelize,
      modelName: 'OutgoingShipmentProduct',
    }
  );

  return OutgoingShipmentProduct;
};