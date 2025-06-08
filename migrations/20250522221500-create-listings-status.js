'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('listings_status', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      description: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Add initial listing status records
    await queryInterface.bulkInsert('listings_status', [
      {
        id: 1,
        description: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 2,
        description: 'OUT_OF_STOCK',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 3,
        description: 'LISTING_ERROR',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 4,
        description: 'IN_WAREHOUSE',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 5,
        description: 'TRACKING',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('listings_status');
  }
}; 