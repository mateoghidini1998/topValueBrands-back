'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Products', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      ASIN: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: false,
      },
      product_image: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      product_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      seller_sku: {
        type: Sequelize.STRING.BINARY,
        allowNull: true,
        unique: true,
        collate: 'utf8_bin',
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
      supplier_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Suppliers',
          key: 'id',
        },
      },
      supplier_item_number: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      product_cost: {
        type: Sequelize.FLOAT,
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
        allowNull: true,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Products');
  },
};
