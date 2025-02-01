'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('PurchaseOrderProducts', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: true, 
      defaultValue: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('PurchaseOrderProducts', 'is_active');
  }
};