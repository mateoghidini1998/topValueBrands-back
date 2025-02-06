const { sequelize, Product } = require('../models');

exports.recalculateWarehouseStock = async (productId) => {
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
      replacements: { productId },
      type: sequelize.QueryTypes.SELECT, 
    }
  );

  if (result.length === 0) {
    console.warn(`No warehouse stock data found for product_id=${productId}`);
    return;
  }

  const { warehouse_stock } = result[0];

  // Actualizar el warehouse_stock del producto
  await Product.update(
    { warehouse_stock },
    { where: { id: productId } }
  );
};
