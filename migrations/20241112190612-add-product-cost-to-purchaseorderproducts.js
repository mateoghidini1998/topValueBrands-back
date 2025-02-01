'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Cambia el tipo de dato de `unit_price` a DECIMAL(10, 2)
    await queryInterface.addColumn('PurchaseOrderProducts', 'product_cost', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      // set default value with the lowest_fba_price from trackedproduct - unit_price
      defaultValue: 0.0,
    });

    // Paso 2: Actualiza `profit` para cada fila usando datos de `trackedproduct`
    await queryInterface.sequelize.query(`
      UPDATE PurchaseOrderProducts AS pop
      SET product_cost = (
        SELECT COALESCE(p.product_cost, 0)
        FROM Products AS p
        WHERE p.id = pop.product_id
      )
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Si es necesario revertir, cambia el tipo de dato de vuelta
    await queryInterface.removeColumn('PurchaseOrderProducts', 'product_cost', {
      type: Sequelize.DECIMAL, // O el tipo de dato anterior
      allowNull: false,
    });
  },
};
