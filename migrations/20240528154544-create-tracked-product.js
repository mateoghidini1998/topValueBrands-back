'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TrackedProducts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      product_id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        references: {
          model: 'Products',
          key: 'id',
        },
      },
      current_rank: {
        type: Sequelize.INTEGER,
      },
      thirty_days_rank: {
        type: Sequelize.INTEGER,
      },
      ninety_days_rank: {
        type: Sequelize.INTEGER,
      },
      units_sold: {
        type: Sequelize.INTEGER,
        default: 0
      },
      product_velocity: {
        type: Sequelize.FLOAT,
        default: 0
      },
      lowest_fba_price: {
        type: Sequelize.FLOAT,
      },
      fees: {
        type: Sequelize.FLOAT,
        default: 0
      },
      profit: {
        type: Sequelize.FLOAT,
        default: 0
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('TrackedProducts');
  },
};
