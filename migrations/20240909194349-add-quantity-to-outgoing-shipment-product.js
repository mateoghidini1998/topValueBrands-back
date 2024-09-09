'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('OutgoingShipmentProducts', 'quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1, // Ajusta el valor por defecto según tus necesidades
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('OutgoingShipmentProducts', 'quantity');
  },
};
