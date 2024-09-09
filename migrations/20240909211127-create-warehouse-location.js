'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('WarehouseLocations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      location: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      capacity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      current_capacity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.bulkInsert('warehouselocations', [
      { location: 'A1', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'A2', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'B1', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'B2', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'C1', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'C2', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'D1', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'D2', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'E1', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'E2', capacity: 1, createdAt: new Date(), updatedAt: new Date() },
      { location: 'Floor', capacity: 30, createdAt: new Date(), updatedAt: new Date() }
    ]);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('WarehouseLocations');
  }
};