const { sequelize, Product } = require('../models');
const logger = require('../logger/logger');

exports.recalculateWarehouseStock = async (productId) => {
  try {
    const result = await sequelize.query(
      `
      SELECT 
        COALESCE(SUM(pop.quantity_available), 0) +
        COALESCE(SUM(pp.available_quantity), 0) +
        COALESCE(SUM(osp.quantity), 0) AS total_sum
      FROM 
        (SELECT :productId AS product_id) AS forced
      LEFT JOIN 
        purchaseorderproducts AS pop ON pop.product_id = forced.product_id
      LEFT JOIN 
        palletproducts AS pp ON pop.id = pp.purchaseorderproduct_id
      LEFT JOIN 
        outgoingshipmentproducts AS osp ON pp.id = osp.pallet_product_id
      LEFT JOIN 
        outgoingshipments AS os ON osp.outgoing_shipment_id = os.id
      LEFT JOIN 
        purchaseorders AS po ON pop.purchase_order_id = po.id
      WHERE 
        (po.is_active = 1 OR po.is_active IS NULL)
        AND (os.status = 'WORKING' OR os.status IS NULL);
      `,
      {
        replacements: { productId },
        type: sequelize.QueryTypes.SELECT,
      }
    )

    const totalSum = result.length > 0 ? result[0].total_sum : 0;

    console.log(`Calculated warehouse_stock for product_id=${productId}: ${totalSum}`);

    // Update the warehouse_stock of the product
    await Product.update({ warehouse_stock: totalSum }, { where: { id: productId } });

    // Fetch the updated product to confirm the change
    const updatedProduct = await Product.findByPk(productId);
    console.log(`Updated product data:`, updatedProduct.toJSON());
    console.log(`Updated product data:`, updatedProduct.toJSON())
  } catch (error) {
    logger.error(`Error recalculating warehouse stock for product_id=${productId}:`, error)
    throw error
  }
}