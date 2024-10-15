'use strict';

const purchaseorderproduct = require('../models/purchaseorderproduct');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PalletProducts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      purchaseorderproduct_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'PurchaseOrderProducts',
          key: 'id'
        },
        allowNull: false,
        onDelete: 'CASCADE'
      },
      pallet_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Pallets',
          key: 'id'
        },
        allowNull: false,
        onDelete: 'CASCADE'
      },
      quantity: {
        type: Sequelize.INTEGER
      },
      available_quantity: {
        type: Sequelize.INTEGER
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
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('PalletProducts');
  }
};