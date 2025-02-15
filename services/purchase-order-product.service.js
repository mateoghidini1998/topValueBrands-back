const purchaseOrderProductRepository = require("../repositories/purchase-order-products.repository");

const findPurchaseOrderProduct = async (id, transaction) => {
    const purchaseOrderProduct = await purchaseOrderProductRepository.FindPurchaseOrderProductById(id, transaction);
    if (!purchaseOrderProduct) {
      throw new Error(`Purchase order product not found.`);
    }

    return purchaseOrderProduct
}

const findByIds = async (ids, transaction) => {
  const purchaseOrderProducts = await purchaseOrderProductRepository.FindByIds(ids, transaction);
  if (!purchaseOrderProducts || purchaseOrderProducts.length === 0) {
    throw new Error("No purchase order products found.");
  }
  return purchaseOrderProducts;
};

const restoreQuantities = async (palletProducts, transaction) => {
  const purchaseOrderProductIds = palletProducts.map(pp => pp.purchaseorderproduct_id);

  const purchaseOrderProducts = await findByIds(purchaseOrderProductIds, transaction);

  const purchaseOrderProductMap = new Map(
    purchaseOrderProducts.map(pop => [pop.id, pop])
  );

  for (const palletProduct of palletProducts) {
    const purchaseOrderProduct = purchaseOrderProductMap.get(palletProduct.purchaseorderproduct_id);

    if (!purchaseOrderProduct) {
      throw new Error(`Purchase Order Product with ID ${palletProduct.purchaseorderproduct_id} not found`);
    }

    purchaseOrderProduct.quantity_available += palletProduct.quantity;
  }

  await Promise.all(purchaseOrderProducts.map(pop => pop.save({ transaction })));
}

module.exports = {
    findPurchaseOrderProduct,
    findByIds,
    restoreQuantities
}