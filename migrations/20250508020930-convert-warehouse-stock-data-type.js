'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.changeColumn('products', 'warehouse_stock', {
      type: Sequelize.INTEGER,
      allowNull: true, // o false si querés que sea obligatorio
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Asegurate de usar el tipo anterior aquí (por ejemplo, si antes era STRING, DECIMAL, etc.)
    return queryInterface.changeColumn('products', 'warehouse_stock', {
      type: Sequelize.DECIMAL(10, 2), // cambiá esto según el tipo original
      allowNull: true,
    });
  }
};