'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Agregar la nueva columna
    await queryInterface.addColumn('OutgoingShipments', 'fba_shipment_id', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    // Reordenar las columnas ejecutando una consulta SQL personalizada
    await queryInterface.sequelize.query(`
      ALTER TABLE OutgoingShipments 
      MODIFY COLUMN fba_shipment_id VARCHAR(255) AFTER shipment_number;
    `);
    
    await queryInterface.sequelize.query(`
      ALTER TABLE OutgoingShipments 
      MODIFY COLUMN status VARCHAR(255) AFTER fba_shipment_id;
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remover la columna en la migración de reversión
    await queryInterface.removeColumn('OutgoingShipments', 'fba_shipment_id');
  }
};
