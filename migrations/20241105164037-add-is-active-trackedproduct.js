'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('TrackedProducts', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: true, // o false si es obligatorio
      defaultValue: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('TrackedProducts', 'is_active');
  }
};
