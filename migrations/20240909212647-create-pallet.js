'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Pallets', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      pallet_number: {
        type: Sequelize.STRING,
        allowNull: false
      },
      warehouse_location_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'warehouselocations',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      purchase_order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'purchaseorders',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('pallets', ['warehouse_location_id']);
    await queryInterface.addIndex('pallets', ['purchase_order_id']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('pallets', ['warehouse_location_id']);
    await queryInterface.removeIndex('pallets', ['purchase_order_id']);

    await queryInterface.dropTable('Pallets');
  }
};