'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {

    // seller_sku ya existia en products como null.

    await queryInterface.sequelize.query(`
      UPDATE products p
      JOIN amz_product_details a
        ON a.product_id = p.id
      SET p.seller_sku = a.seller_sku
      WHERE a.seller_sku IS NOT NULL
    `);


    await queryInterface.sequelize.query(`
      UPDATE products p
      JOIN wmt_product_details w
        ON w.product_id = p.id
      SET p.seller_sku = w.seller_sku
      WHERE p.seller_sku IS NULL
        AND w.seller_sku IS NOT NULL
    `);


    await queryInterface.removeColumn('amz_product_details', 'seller_sku');
    await queryInterface.removeColumn('wmt_product_details', 'seller_sku');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('amz_product_details', 'seller_sku', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: ''
    });
    await queryInterface.addColumn('wmt_product_details', 'seller_sku', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: ''
    });

    // 2. Rellenar desde Products
    await queryInterface.sequelize.query(`
      UPDATE amz_product_details a
      JOIN products p ON p.id = a.product_id
      SET a.seller_sku = p.seller_sku
    `);
    await queryInterface.sequelize.query(`
      UPDATE wmt_product_details w
      JOIN products p ON p.id = w.product_id
      SET w.seller_sku = p.seller_sku
    `);

    // 3. Quitar la columna de Products
    await queryInterface.removeColumn('products', 'seller_sku');
  }
};