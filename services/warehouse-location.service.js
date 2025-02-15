const warehouseLocationRepository = require("../repositories/warehouse.repository");

const findById = async (warehouse_location_id, transaction) => {
  const warehouseLocation = await warehouseLocationRepository.FindById(warehouse_location_id, transaction);
  if (!warehouseLocation) {
    throw new Error("Warehouse location not found");
  }

  return warehouseLocation;
};

const updateCurrentCapacity = async (warehouse_location_id, transaction) => {
  return await warehouseLocationRepository.UpdateCurrentCapacity(warehouse_location_id, transaction)
}

const isLocationAvailable = async (warehouse_location_id) => {
  const warehouseLocation = await findById(warehouse_location_id)
  return warehouseLocation.current_capacity > 0;
}

module.exports = {
  findById,
  updateCurrentCapacity,
  isLocationAvailable
};
