'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Wmt_Product_Details', {
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
      gtin: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      seller_sku: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      available_to_sell_qty: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00,
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
    await queryInterface.dropTable('Wmt_Product_Details');
  }
};
