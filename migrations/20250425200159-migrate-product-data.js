'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const [products] = await queryInterface.sequelize.query(
      'SELECT id, ASIN, seller_sku, warehouse_stock, FBA_available_inventory, reserved_quantity, Inbound_to_FBA, pack_type, is_active, in_seller_account FROM Products'
    );

    for (const product of products) {
      await queryInterface.bulkInsert('Amz_Product_Details', [{
        product_id: product.id,
        ASIN: product.ASIN,
        seller_sku: product.seller_sku,
        warehouse_stock: product.warehouse_stock,
        FBA_available_inventory: product.FBA_available_inventory,
        reserved_quantity: product.reserved_quantity,
        Inbound_to_FBA: product.Inbound_to_FBA,
        pack_type: product.pack_type,
        is_active: product.is_active,
        in_seller_account: product.in_seller_account,
        createdAt: new Date(),
        updatedAt: new Date(),
      }]);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Amz_Product_Details', null, {});
  },
};
