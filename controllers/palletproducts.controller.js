const { PurchaseOrderProduct, Pallet, PalletProduct } = require('../models');
const asyncHandler = require("../middlewares/async");


exports.createPalletProduct = asyncHandler(async ({ purchaseorderproduct_id, pallet_id, quantity }) => {
    const purchaseOrderProduct = await PurchaseOrderProduct.findOne({ where: { id: purchaseorderproduct_id } });
    const pallet = await Pallet.findOne({ where: { id: pallet_id } });
  
    if (!pallet) {
      throw new Error('Pallet not found');
    }
  
    if (!purchaseOrderProduct) {
      throw new Error('Purchase Order Product not found');
    }
  
    if (quantity > purchaseOrderProduct.quantity_available) {
      throw new Error('Quantity exceeds available stock');
    }
  
    const palletProduct = await PalletProduct.create({
      purchaseorderproduct_id,
      pallet_id,
      quantity,
      available_quantity: quantity
    });
  
    purchaseOrderProduct.quantity_available -= quantity;
    await purchaseOrderProduct.save();
  
    return palletProduct;
  });