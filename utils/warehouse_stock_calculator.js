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
        purchaseorderproducts AS pop
      LEFT JOIN 
        palletproducts AS pp ON pop.id = pp.purchaseorderproduct_id
      LEFT JOIN 
        outgoingshipmentproducts AS osp ON pp.id = osp.pallet_product_id
      LEFT JOIN 
        outgoingshipments AS os ON osp.outgoing_shipment_id = os.id
      LEFT JOIN 
        purchaseorders AS po ON pop.purchase_order_id = po.id
      WHERE 
        pop.product_id = :productId
        AND po.is_active = 1
        AND (os.status = 'WORKING' OR os.status IS NULL)
      GROUP BY 
        pop.product_id
      `,
      {
        replacements: { productId },
        type: sequelize.QueryTypes.SELECT,
      }
    )

    if (result.length === 0) {
      logger.warn(`No warehouse stock data found for product_id=${productId}`)
      return
    }

    const { total_sum } = result[0]

    logger.info(`Calculated warehouse_stock for product_id=${productId}: ${total_sum}`)

    // Update the warehouse_stock of the product
    const [updatedRows] = await Product.update({ warehouse_stock: total_sum }, { where: { id: productId } })

    // Fetch the updated product to confirm the change
    const updatedProduct = await Product.findByPk(productId)
    logger.info(`Updated product data:`, updatedProduct.toJSON())
  } catch (error) {
    logger.error(`Error recalculating warehouse stock for product_id=${productId}:`, error)
    throw error
  }
}