const { QueryTypes } = require("sequelize");
const { PurchaseOrder, sequelize } = require("../models");

const FindById = async (id, transaction) => {
  return await PurchaseOrder.findByPk(id, { transaction });
};

const FindPurchaseOrdersByProduct = async (productId) => {
  const result = await sequelize.query(
    `
        SELECT COUNT(*) as purchase_orders_count
        FROM top_value_brands.purchaseorders po
        JOIN purchaseorderproducts pop ON pop.purchase_order_id = po.id
        JOIN products p ON pop.product_id = p.id
        WHERE p.id = :product_id
        AND purchase_order_status_id NOT IN (3, 5, 6, 7);
    `, { replacements: { product_id: productId }, type: QueryTypes.SELECT }
  );

  return purchase_orders_count = result[0].purchase_orders_count
};

module.exports = {
  FindById,
  FindPurchaseOrdersByProduct
};