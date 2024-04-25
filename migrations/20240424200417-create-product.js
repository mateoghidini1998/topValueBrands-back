'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Products', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      ASIN: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: false
      },
      product_image: {
        type: Sequelize.STRING,
        allowNull: true
      },
      product_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      seller_sku: {
        type: Sequelize.STRING,
        allowNull: true
      },
      FBA_available_inventory: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      FC_transfer: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      Inbound_to_FBA: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      supplier_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      supplier_item_number: {
        type: Sequelize.STRING,
        allowNull:true
      },
      product_cost: {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 0
      },
      pack_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      createdAt: {
        allowNull: true,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: true,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Products');
  }
};