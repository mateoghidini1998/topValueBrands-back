'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Crear la tabla PurchaseOrderStatus con ENUM
    await queryInterface.createTable('PurchaseOrderStatus', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      description: {
        type: Sequelize.ENUM(
          'Rejected',
          'Pending',
          'Good to go',
          'Cancelled',
          'In transit',
          'Arrived',
          'Closed',
          'Waiting for supplier approval'
        ),
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Insertar los estados directamente despuÃ©s de crear la tabla
    await queryInterface.bulkInsert('PurchaseOrderStatus', [
      { description: 'Rejected', createdAt: new Date(), updatedAt: new Date() },
      { description: 'Pending', createdAt: new Date(), updatedAt: new Date() },
      { description: 'Good to go', createdAt: new Date(), updatedAt: new Date() },
      { description: 'Cancelled', createdAt: new Date(), updatedAt: new Date() },
      { description: 'In transit', createdAt: new Date(), updatedAt: new Date() },
      { description: 'Arrived', createdAt: new Date(), updatedAt: new Date() },
      { description: 'Closed', createdAt: new Date(), updatedAt: new Date() },
      { description: 'Waiting for supplier approval', createdAt: new Date(), updatedAt: new Date() }
    ]);
  },

  async down(queryInterface, Sequelize) {
    // Eliminar los datos insertados
    await queryInterface.bulkDelete('PurchaseOrderStatus', null, {});

    // Antes de eliminar la tabla, debemos eliminar el ENUM
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_PurchaseOrderStatus_description";');
    await queryInterface.dropTable('PurchaseOrderStatus');
  }
};