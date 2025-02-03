"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("OutgoingShipmentProducts", "is_checked", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.sequelize.query(`
      UPDATE OutgoingShipmentProducts
      SET is_checked = false
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("OutgoingShipmentProducts", "is_checked");
  },
};
