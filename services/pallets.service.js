const palletRepository = require("../repositories/pallet.repository");
const palletProductService = require("../services/pallet-products.service")
const palletProductRepository = require("../repositories/pallet-products.repository")
const purchaseOrderService = require("../services/purchase-order.service");
const purchaseOrderProductService = require('../services/purchase-order-product.service')
const warehouseService = require("../services/warehouse-location.service");
const outgoingShipmentProductRepository = require('../repositories/outgoing-shipment-products.repository')
const { sequelize } = require("../models");

const createPallet = async (palletData) => {
  const { pallet_number, warehouse_location_id, purchase_order_id, products } =
    palletData;

  const transaction = await sequelize.transaction();

  try {
    await warehouseService.findById(
      warehouse_location_id,
      transaction
    );
    await purchaseOrderService.findById(
      purchase_order_id,
      transaction
    );
    const existing_pallet = await findByPalletNumber(
      pallet_number,
      transaction
    );
    if (existing_pallet) {
      throw new Error("Pallet number already exists");
    }

    if (!warehouseService.isLocationAvailable(warehouse_location_id)) {
        throw new Error("Ware house location has no space available")
    }

    const pallet = await palletRepository.CreatePallet(
      { pallet_number, warehouse_location_id, purchase_order_id },
      transaction
    );

    await warehouseService.updateCurrentCapacity(warehouse_location_id, transaction)

    if (!products || products.length === 0) {
      throw new Error("No products provided to associate with the pallet.");
    }
    
    await palletProductService.createPalletProduct(pallet.id, products, transaction);


    await transaction.commit();
    return pallet;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const findAll = async ({ page = 1, limit = 50, keyword = '', warehouse_location, orderBy = 'updatedAt', orderWay = 'DESC' }) => {
  const offset = (page - 1) * limit;

  const allowedOrderBy = [ 'updatedAt' ]
  if (!allowedOrderBy.includes(orderBy)) orderBy = 'updatedAt';

  const allowedOrderWay = ['ASC', 'DESC'];
  if (!allowedOrderWay.includes(orderWay)) orderWay = 'DESC';

  let whereClause = "WHERE p.is_active = 1";
  let replacements = {};

  if (warehouse_location) {
    whereClause += " AND p.warehouse_location_id = :warehouse_location_id";
    replacements.warehouse_location_id = warehouse_location;
  }

  if (keyword) {
    whereClause += ` AND (
      p.pallet_number LIKE :keyword
    )`;
    replacements.keyword = `%${keyword}%`;
  }

  const { pallets, count } = await palletRepository.FindAll({
    whereClause,
    replacements,
    orderBy,
    orderWay,
    limit,
    offset,
  })

  return {
    count,
    pages: Math.ceil(count / limit),
    current_page: page,
    data: pallets
  }

}

const findByPalletNumber = async (pallet_number) => {
  const pallet = palletRepository.FindPalletByNumber(pallet_number);
  if (!pallet) {
    throw new Error("Pallet not found");
  }

  return pallet;
};

const findById = async (id) => {
  const pallet = await palletRepository.FindById(id);
  if (!pallet) {
    throw new Error("Pallet not found");
  }

  return pallet;
};

const deletePallet = async (id) => {
  const transaction = await sequelize.transaction();

  try {
    const pallet = await findById(id)
  
    const warehouse_location = await warehouseService.findById(pallet.warehouse_location_id, transaction)
  
    const pallet_products = await palletProductRepository.FindAll(id, transaction);

    if (pallet_products.length > 0) {
      for (const palletProduct of pallet_products) {
        const isLinkedToShipment = await outgoingShipmentProductRepository.ExistsByPalletProductId(
          palletProduct.id,
          transaction
        );

        if (isLinkedToShipment) {
          throw new Error(`Pallet cannot be deleted because it's associated with an outgoing shipment.`);
        }
      }

      await purchaseOrderProductService.restoreQuantities(pallet_products, transaction);
      await palletProductRepository.Delete(id, transaction)
    }

    warehouse_location.current_capacity += 1;
    await warehouse_location.save({ transaction })

    await palletRepository.DeletePallet(id, transaction)
    await transaction.commit();
  
    return pallet;
    
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}



module.exports = {
  findAll,
  findById,
  findByPalletNumber,
  createPallet,
  deletePallet
}