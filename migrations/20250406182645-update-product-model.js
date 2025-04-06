'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     * image
     * name
     * cost
     * is_active
     * createdAt
     * updatedAt
     * warehouse_stock
     */

    // remove column FBA_available_inventory
    await queryInterface.removeColumn('products', 'FBA_available_inventory');
    await queryInterface.removeColumn('products', 'reserved_quantity');
    await queryInterface.removeColumn('products', 'Inbound_to_FBA');
    await queryInterface.removeColumn('products', 'in_seller_account');
    await queryInterface.removeColumn('products', 'dangerous_goods');
    await queryInterface.removeColumn('products', 'FBA_available_inventory');
    await queryInterface.removeColumn('products', 'ASIN');
    await queryInterface.removeColumn('products', 'seller_sku');
    await queryInterface.removeColumn('products', 'supplier_item_number');
    await queryInterface.removeColumn('products', 'supplier_id');
    await queryInterface.removeColumn('products', 'upc');



  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */

    // add column FBA_available_inventory
    await queryInterface.addColumn('products', 'FBA_available_inventory', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'reserved_quantity', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'Inbound_to_FBA', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'in_seller_account', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'dangerous_goods', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'FBA_available_inventory', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'ASIN', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'seller_sku', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'supplier_item_number', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'supplier_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'upc', {
      type: Sequelize.STRING,
      allowNull: true,
    });

  }

}