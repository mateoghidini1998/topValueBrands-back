'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('PurchaseOrders', 'updatedStatusAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Actualizar los registros existentes
    await queryInterface.sequelize.query(`
      UPDATE PurchaseOrders 
      SET updatedStatusAt = NOW() 
      WHERE updatedStatusAt IS NULL OR updatedStatusAt = '0000-00-00 00:00:00';
    `);
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */

    await queryInterface.removeColumn('PurchaseOrderProducts', 'updatedStatusAt');
  }
};
