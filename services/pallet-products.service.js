const palletProductRepository = require("../repositories/pallet-products.repository");
const { recalculateWarehouseStock } = require("../utils/warehouse_stock_calculator");
const purchaseOrderProductService = require("./purchase-order-product.service");

const createPalletProduct = async (pallet_id, products, transaction) => {
  if (!products || products.length === 0) {
    throw new Error("No products provided to associate with the pallet.");
  }
  const purchaseOrderProductIds = products.map(
    (p) => p.purchaseorderproduct_id
  );

  const purchaseOrderProducts = await purchaseOrderProductService.findByIds(
    purchaseOrderProductIds,
    transaction
  );

  if (purchaseOrderProducts.length !== products.length) {
    throw new Error("Some products from the purchase order were not found.");
  }

  const purchaseOrderProductMap = new Map(
    purchaseOrderProducts.map(pop => [pop.id, pop])
  );
  
  const palletProductsData = products.map((product) => {
    const purchaseOrderProduct = purchaseOrderProductMap.get(product.purchaseorderproduct_id);

    if (!purchaseOrderProduct) {
      throw new Error(`Purchase Order Product ID ${product.purchaseorderproduct_id} not found.`);
    }

    if (product.quantity > purchaseOrderProduct.quantity_available) {
      throw new Error(
        `Cannot allocate ${product.quantity} units. Only ${purchaseOrderProduct.quantity_available} available.`
      );
    }

    purchaseOrderProduct.quantity_available -= product.quantity;

    return {
      pallet_id,
      purchaseorderproduct_id: product.purchaseorderproduct_id,
      quantity: product.quantity,
      available_quantity: product.quantity
    };
  });

  await Promise.all(
    purchaseOrderProducts.map(pop => pop.save({ transaction }))
  );

  await palletProductRepository.BulkCreatePalletProducts(
    palletProductsData,
    transaction
  );

  const productsToUpdate = new Set(
    purchaseOrderProducts.map((p) => p.product_id)
  );

  for (const productId of productsToUpdate) {
    await recalculateWarehouseStock(productId)
  }

  return Array.from(productsToUpdate); 
};

const findAll = async (pallet_id) => {
  
}

module.exports = {
  createPalletProduct,
  findAll
};
