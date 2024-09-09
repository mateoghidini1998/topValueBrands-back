'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('OutgoingShipmentProducts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      outgoing_shipment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'OutgoingShipments',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      purchase_order_product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'PurchaseOrderProducts',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('OutgoingShipmentProducts');
  },
};
