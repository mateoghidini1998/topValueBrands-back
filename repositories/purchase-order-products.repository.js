const { PurchaseOrderProduct } = require("../models");

const FindPurchaseOrderProductById = async (id, transaction) => {
  return await PurchaseOrderProduct.findByPk(id, { transaction });
}

const FindByIds = async (ids, transaction) => {
  return await PurchaseOrderProduct.findAll({
    where: { id: ids },
    transaction,
  });
};

module.exports = {
  FindPurchaseOrderProductById,
  FindByIds
}