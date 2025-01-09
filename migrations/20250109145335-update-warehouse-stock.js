'use strict';

const { sequelize, Product } = require('../models');
const { QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Calculando y actualizando warehouse_stock para todos los productos...');

    // Obtener todos los product_id
    const products = await sequelize.query(
      `
      SELECT id AS product_id FROM products
      `,
      {
        type: QueryTypes.SELECT,
      }
    );

    if (!products || products.length === 0) {
      console.log('No se encontraron productos en la base de datos.');
      return;
    }

    // Recorrer cada producto y actualizar su warehouse_stock
    for (const product of products) {
      const { product_id } = product;

      // Calcular el warehouse_stock para este producto
      const result = await sequelize.query(
        `
        SELECT 
            COALESCE(SUM(pop.quantity_available), 0) AS quantity_available,
            COALESCE(SUM(pp.available_quantity), 0) AS pallet_available_quantity,
            COALESCE(SUM(osp.quantity), 0) AS outgoing_shipment_quantity,
            (
                COALESCE(SUM(pop.quantity_available), 0) +
                COALESCE(SUM(pp.available_quantity), 0) +
                COALESCE(SUM(osp.quantity), 0)
            ) AS warehouse_stock
        FROM 
            purchaseorderproducts AS pop
        LEFT JOIN 
            palletproducts AS pp ON pop.id = pp.purchaseorderproduct_id
        LEFT JOIN 
            outgoingshipmentproducts AS osp ON pp.id = osp.pallet_product_id
        LEFT JOIN 
            outgoingshipments AS os ON osp.outgoing_shipment_id = os.id AND os.status = 'WORKING'
        LEFT JOIN 
            purchaseorders AS po ON pop.purchase_order_id = po.id
        WHERE 
            pop.product_id = :productId
            AND po.is_active = true
        GROUP BY 
            pop.product_id
        `,
        {
          replacements: { productId: product_id },
          type: QueryTypes.SELECT,
        }
      );

      if (result.length > 0) {
        const { warehouse_stock } = result[0];

        // Actualizar el warehouse_stock en la tabla products
        await queryInterface.sequelize.query(
          `
          UPDATE products
          SET warehouse_stock = :warehouse_stock
          WHERE id = :product_id
          `,
          {
            replacements: { warehouse_stock, product_id },
          }
        );

        console.log(`Warehouse stock actualizado para product_id=${product_id}: ${warehouse_stock}`);
      } else {
        console.warn(`No warehouse stock data found for product_id=${product_id}`);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    // Si necesitas revertir la migración, puedes dejar warehouse_stock en NULL
    await queryInterface.sequelize.query(
      `
      UPDATE products
      SET warehouse_stock = NULL
      `
    );
  },
};
