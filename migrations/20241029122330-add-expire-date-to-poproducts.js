'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('PurchaseOrderProducts', 'expire_date', {
      type: Sequelize.DATE,
      allowNull: true, // o false si es obligatorio
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('PurchaseOrderProducts', 'expire_date');
  },
};