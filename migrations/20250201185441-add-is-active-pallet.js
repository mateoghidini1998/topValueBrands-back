'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn("Pallets", "is_active", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.sequelize.query(`
      UPDATE Pallets
      SET is_active = true
    `);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn("Pallets", "is_active");

  }
};
