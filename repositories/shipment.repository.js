const { QueryTypes } = require("sequelize");
const { sequelize } = require("../models");

const FindAllShipmentsAssociatedToProduct = async (productId) => {
  const result =  await sequelize.query(
    `
        SELECT COUNT(*) as shipments_count
        FROM top_value_brands.outgoingshipments os
        JOIN outgoingshipmentproducts osp ON osp.outgoing_shipment_id = os.id
        JOIN palletproducts pap ON pap.id = osp.pallet_product_id
        JOIN purchaseorderproducts pop ON pap.purchaseorderproduct_id = pop.id
        JOIN products p ON pop.product_id = p.id
        WHERE p.id = product_id AND os.status != "WORKING";
    `, { replacements: { product_id: productId }, type: QueryTypes.SELECT }
  );

  return shipments_count  = result[0].shipments_count
};

module.exports = {
    FindAllShipmentsAssociatedToProduct
}
