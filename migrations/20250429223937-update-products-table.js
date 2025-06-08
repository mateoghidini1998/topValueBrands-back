'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Products', 'ASIN');
    await queryInterface.removeColumn('Products', 'seller_sku');
    await queryInterface.removeColumn('Products', 'FBA_available_inventory');
    await queryInterface.removeColumn('Products', 'reserved_quantity');
    await queryInterface.removeColumn('Products', 'Inbound_to_FBA');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('Products', 'ASIN', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('Products', 'seller_sku', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('Products', 'FBA_available_inventory', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
    });

    await queryInterface.addColumn('Products', 'reserved_quantity', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
    });

    await queryInterface.addColumn('Products', 'Inbound_to_FBA', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
    });
  }
};
