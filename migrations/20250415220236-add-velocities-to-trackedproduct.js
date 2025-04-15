'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */

    await queryInterface.addColumn('TrackedProducts', 'product_velocity_2', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('TrackedProducts', 'product_velocity_7', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('TrackedProducts', 'product_velocity_15', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('TrackedProducts', 'product_velocity_60', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 0
    });


  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('TrackedProducts', 'product_velocity_2');
    await queryInterface.removeColumn('TrackedProducts', 'product_velocity_7');
    await queryInterface.removeColumn('TrackedProducts', 'product_velocity_15');
    await queryInterface.removeColumn('TrackedProducts', 'product_velocity_60');
  }
};
