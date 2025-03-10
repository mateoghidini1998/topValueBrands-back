'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Agregar la nueva columna
    await queryInterface.addColumn('OutgoingShipments', 'reference_id', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remover la columna en la migración de reversión
    await queryInterface.removeColumn('OutgoingShipments', 'reference_id');
  }
};
