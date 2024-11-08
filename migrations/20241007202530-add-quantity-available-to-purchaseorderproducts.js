'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('purchaseorderproducts', 'quantity_available', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0 // Puedes poner un valor por defecto si es necesario
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('purchaseorderproducts', 'quantity_available');
  }
};
