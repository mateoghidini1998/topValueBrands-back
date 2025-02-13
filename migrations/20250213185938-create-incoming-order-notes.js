'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('PurchaseOrders', 'incoming_order_notes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('PurchaseOrders', 'incoming_order_notes', {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  },
};
