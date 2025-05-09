'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Cambia el tipo de dato de `unit_price` a DECIMAL(10, 2)
    await queryInterface.changeColumn('Products', 'product_cost', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Si es necesario revertir, cambia el tipo de dato de vuelta
    await queryInterface.changeColumn('Products', 'product_cost', {
      type: Sequelize.DECIMAL, // O el tipo de dato anterior
      allowNull: true,
    });
  },
};
