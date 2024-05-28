'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TrackedProducts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      ASIN: {
        type: Sequelize.STRING
      },
      seller_sku: {
        type: Sequelize.STRING
      },
      current_rank: {
        type: Sequelize.INTEGER
      },
      thirty_days_rank: {
        type: Sequelize.INTEGER
      },
      ninety_days_rank: {
        type: Sequelize.INTEGER
      },
      units_sold: {
        type: Sequelize.INTEGER
      },
      product_velocity: {
        type: Sequelize.FLOAT
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
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('TrackedProducts');
  }
};