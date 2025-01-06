'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Actualizar warehouse_stock de los productos calculando la diferencia entre inbound y outbound
     */

    await queryInterface.sequelize.query(`
      UPDATE Products AS p
      LEFT JOIN (
        -- Sumar las cantidades compradas para cada producto (entradas)
        SELECT 
          pop.product_id,
          SUM(pop.quantity_purchased) AS total_quantity
        FROM PurchaseOrderProducts AS pop
        GROUP BY pop.product_id
      ) AS inbound ON p.id = inbound.product_id
      LEFT JOIN (
        -- Sumar las cantidades enviadas para cada producto (salidas)
        SELECT 
          pop.product_id,
          SUM(osp.quantity) AS total_quantity
        FROM OutgoingShipmentProducts AS osp
        INNER JOIN PalletProducts AS pp ON osp.pallet_product_id = pp.id
        INNER JOIN PurchaseOrderProducts AS pop ON pp.purchaseorderproduct_id = pop.id
        GROUP BY pop.product_id
      ) AS outbound ON p.id = outbound.product_id
      SET p.warehouse_stock = COALESCE(inbound.total_quantity, 0) - COALESCE(outbound.total_quantity, 0);
    `);
  },

  async down(queryInterface, Sequelize) {
    /**
     * Revertir los valores de warehouse_stock a 0 en caso de deshacer la migración
     */
    await queryInterface.sequelize.query(`
      UPDATE Products
      SET warehouse_stock = 0;
    `);
  }
};
