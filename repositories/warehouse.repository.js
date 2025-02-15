const { WarehouseLocation, sequelize } = require("../models");
const { Op } = require('sequelize');

const FindById = async (id, transaction) => {
  return await WarehouseLocation.findByPk(id, { transaction });
};

const UpdateCurrentCapacity = async (id, transaction) => {
  const [updatedRows] = await WarehouseLocation.update(
    { current_capacity: sequelize.literal("current_capacity - 1") },
    { where: { id, current_capacity: { [Op.gt]: 0 } }, transaction }
  );

  if (updatedRows === 0) {
    throw new Error(`Warehouse location has no space available.`);
  }
}

module.exports = {
  FindById,
  UpdateCurrentCapacity
};
