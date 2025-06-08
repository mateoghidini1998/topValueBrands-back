'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Amz_Product_Details', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      product_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Products', 
          key: 'id'
        },
        allowNull: false,
        onDelete: 'CASCADE'
      },
      ASIN: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      seller_sku: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      warehouse_stock: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      FBA_available_inventory: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      reserved_quantity: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      Inbound_to_FBA: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      pack_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      is_active: {
        allowNull: true,
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      in_seller_account: {
        allowNull: true,
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Amz_Product_Details');
  }
};
