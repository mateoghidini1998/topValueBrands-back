const { sequelize, Product } = require('../models');
const logger = require('../logger/logger');

/**
 * Recalculates the warehouse stock for a given product
 * @param {number} productId - The ID of the product to recalculate
 * @returns {Promise<number>} The new warehouse stock value
 */
exports.recalculateWarehouseStock = async (productId) => {
  const transaction = await sequelize.transaction();
  
  try {
    // First, get the current product to validate it exists
    const product = await Product.findByPk(productId, { transaction });
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    // Calculate available stock from purchase orders
    const purchaseOrderStock = await sequelize.query(
      `
      SELECT COALESCE(SUM(pop.quantity_available), 0) as available_stock
      FROM purchaseorderproducts pop
      INNER JOIN purchaseorders po ON pop.purchase_order_id = po.id
      WHERE pop.product_id = :productId
      AND pop.is_active = true
      AND po.is_active = true
      AND po.purchase_order_status_id IN (2, 3, 5, 6, 7) -- PENDING, GOOD_TO_GO, IN_TRANSIT, ARRIVED, CLOSED
      `,
      {
        replacements: { productId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    // Calculate stock in pallets
    const palletStock = await sequelize.query(
      `
      SELECT COALESCE(SUM(pp.available_quantity), 0) as pallet_stock
      FROM palletproducts pp
      INNER JOIN purchaseorderproducts pop ON pp.purchaseorderproduct_id = pop.id
      WHERE pop.product_id = :productId
      AND pp.is_active = true
      AND pp.available_quantity > 0
      `,
      {
        replacements: { productId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    // Calculate stock in outgoing shipments
    const outgoingShipmentStock = await sequelize.query(
      `
      SELECT COALESCE(SUM(osp.quantity), 0) as outgoing_stock
      FROM outgoingshipmentproducts osp
      INNER JOIN palletproducts pp ON osp.pallet_product_id = pp.id
      INNER JOIN purchaseorderproducts pop ON pp.purchaseorderproduct_id = pop.id
      INNER JOIN outgoingshipments os ON osp.outgoing_shipment_id = os.id
      WHERE pop.product_id = :productId
      AND os.status IN ('WORKING', 'IN_TRANSIT')
      `,
      {
        replacements: { productId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    // Calculate total stock
    const totalStock = 
      (purchaseOrderStock[0]?.available_stock || 0) +
      (palletStock[0]?.pallet_stock || 0) +
      (outgoingShipmentStock[0]?.outgoing_stock || 0);

    // Validate the total stock is not negative
    if (totalStock < 0) {
      logger.warn(`Negative warehouse stock calculated for product ${productId}: ${totalStock}`);
      // You might want to handle this case differently, e.g., set to 0 or throw an error
    }

    // Update the product's warehouse stock
    await product.update({ warehouse_stock: totalStock }, { transaction });

    // Log the calculation
    logger.info(`Recalculated warehouse stock for product ${productId}: ${totalStock}`);

    await transaction.commit();
    return totalStock;

  } catch (error) {
    await transaction.rollback();
    logger.error(`Error recalculating warehouse stock for product ${productId}:`, error);
    throw error;
  }
};

/**
 * Recalculates warehouse stock for multiple products
 * @param {number[]} productIds - Array of product IDs to recalculate
 * @returns {Promise<Object>} Object containing results for each product
 */
exports.recalculateWarehouseStockBatch = async (productIds) => {
  const results = {};
  const errors = [];

  for (const productId of productIds) {
    try {
      const newStock = await exports.recalculateWarehouseStock(productId);
      results[productId] = newStock;
    } catch (error) {
      errors.push({ productId, error: error.message });
    }
  }

  return {
    results,
    errors: errors.length > 0 ? errors : null
  };
};