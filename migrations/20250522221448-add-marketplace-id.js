'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'marketplace_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
      references: {
        model: 'marketplaces',
        key: 'id'
      }
    });

    // Update products with AmazonProductDetail to have marketplace_id = 1
    await queryInterface.sequelize.query(`
      UPDATE products p
      INNER JOIN amz_product_details apd ON p.id = apd.product_id
      SET p.marketplace_id = 1
      WHERE apd.id IS NOT NULL
    `);

    // Update products with WalmartProductDetail to have marketplace_id = 2
    await queryInterface.sequelize.query(`
      UPDATE products p
      INNER JOIN wmt_product_details wpd ON p.id = wpd.product_id
      SET p.marketplace_id = 2
      WHERE wpd.id IS NOT NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('products', 'marketplace_id');
  }
};
