const { QueryTypes } = require("sequelize");
const { sequelize, Pallet } = require("../models");

const CreatePallet = async (palletData, transaction) => {
  return await Pallet.create(palletData, { transaction });
};

const FindById = async (id, transaction) => {
  return await Pallet.findByPk(id, { transaction });
};

const FindPalletByNumber = async (pallet_number, transaction) => {
  return await Pallet.findOne({ where: { pallet_number }, transaction });
};

const FindPalletsAssociatedToProduct = async (productId) => {
  const result = await sequelize.query(
    `
        SELECT COUNT(*) as pallets_count
        FROM top_value_brands.pallets pa
        JOIN palletproducts pap ON pap.pallet_id = pa.id
        JOIN purchaseorderproducts pop ON pap.purchaseorderproduct_id = pop.id
        JOIN products p ON pop.product_id = p.id
        WHERE p.id = :product_id AND pa.is_active = 1
    `,
    { replacements: { product_id: productId }, type: QueryTypes.SELECT }
  );

  const pallets_count = result[0].pallets_count;
  return pallets_count;
};

const FindAll = async ({
  whereClause,
  replacements,
  orderBy,
  orderWay,
  limit,
  offset,
}) => {
  const pallets = await sequelize.query(
    `
      SELECT 
        p.id, 
        p.pallet_number, 
        w.location AS warehouse_location,
        po.order_number AS purchase_order_number,
        p.updatedAt
      FROM pallets p
      LEFT JOIN warehouselocations w ON p.warehouse_location_id = w.id
      LEFT JOIN purchaseorders po ON p.purchase_order_id = po.id
      ${whereClause}
      ORDER BY ${orderBy} ${orderWay}
      LIMIT :limit OFFSET :offset
    `,
    {
      replacements: { ...replacements, limit, offset },
      type: QueryTypes.SELECT
    }
  );

  const countResult = await sequelize.query(
    `
      SELECT COUNT(*) AS total 
      FROM pallets p
      LEFT JOIN warehouselocations w ON p.warehouse_location_id = w.id
      LEFT JOIN purchaseorders po ON p.purchase_order_id = po.id
      ${whereClause}
    `,
    {
      replacements,
      type: QueryTypes.SELECT,
    }
  );

  return {
    pallets,
    count: countResult[0].total
  }
};

const DeletePallet = async (id, transaction) => {
  return await Pallet.destroy({ where: { id }, transaction });
};

module.exports = {
  FindAll,
  FindPalletsAssociatedToProduct,
  CreatePallet,
  FindPalletByNumber,
  FindById,
  DeletePallet,
};