'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Pallets', 'warehouse_location_id', {
      type: Sequelize.INTEGER,
      allowNull: true, 
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Pallets', 'warehouse_location_id', {
      type: Sequelize.INTEGER,
      allowNull: false, 
    });
  },
};
