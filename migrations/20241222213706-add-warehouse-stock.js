'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Agregar la nueva columna
    await queryInterface.addColumn('Products', 'warehouse_stock', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    // Reordenar las columnas ejecutando una consulta SQL personalizada
    await queryInterface.sequelize.query(`
      ALTER TABLE Products 
      MODIFY COLUMN warehouse_stock VARCHAR(255) AFTER seller_sku;
    `);
    
  },

  async down(queryInterface, Sequelize) {
    // Remover la columna en la migración de reversión
    await queryInterface.removeColumn('Products', 'warehouse_stock');
  }
};