'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('PurchaseOrderProducts', 'notes', {
      type: Sequelize.STRING,
      allowNull: true, // o false si es obligatorio
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('PurchaseOrderProducts', 'notes');
  },
};
