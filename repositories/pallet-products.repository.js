const { PalletProduct, sequelize } = require("../models");
const { QueryTypes, where } = require("sequelize");

const BulkCreatePalletProducts = async (palletProductData, transaction) => {
  return await PalletProduct.bulkCreate(palletProductData, { transaction });
};

const FindAll = async (pallet_id, transaction = null) => {
  const result = await sequelize.query(
    `
    SELECT pp.id, pp.purchaseorderproduct_id, pp.pallet_id, pp.quantity FROM palletproducts pp
    WHERE pp.pallet_id = :pallet_id
  `,
    { replacements: { pallet_id }, type: QueryTypes.SELECT, transaction }
  );
  return result;
};

const Delete = async (pallet_id, transaction) => {
  return await PalletProduct.destroy({
    where: { pallet_id },
    transaction
  })
}



module.exports = {
  BulkCreatePalletProducts,
  FindAll,
  Delete
};
