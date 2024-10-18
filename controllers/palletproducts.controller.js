const { PurchaseOrderProduct, Pallet, PalletProduct } = require('../models');
const asyncHandler = require("../middlewares/async");


exports.createPalletProduct = asyncHandler(async ({ purchaseorderproduct_id, pallet_id, quantity, transaction }) => {
  const purchaseOrderProduct = await PurchaseOrderProduct.findOne({ 
    where: { id: purchaseorderproduct_id }, 
    transaction 
  });

  const pallet = await Pallet.findOne({ 
    where: { id: pallet_id }, 
    transaction 
  });
  
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
    }, { transaction }); 
  
    purchaseOrderProduct.quantity_available -= quantity;
    await purchaseOrderProduct.save({ transaction }); 
  
    return palletProduct;
});

exports.updatePalletProduct = asyncHandler(async ({ purchaseorderproduct_id, pallet_id, quantity }) => {
  const palletProduct = await PalletProduct.findOne({ 
    where: { 
      pallet_id, 
      purchaseorderproduct_id 
    } 
  });

  const purchaseOrderProduct = await PurchaseOrderProduct.findOne({ 
    where: { id: purchaseorderproduct_id } 
  });

  if (!palletProduct) {
    throw new Error('PalletProduct not found');
  }

  if (!purchaseOrderProduct) {
    throw new Error('Purchase Order Product not found');
  }

  const oldQuantity = palletProduct.quantity;
  const newQuantity = quantity;
  let finalAvailableQuantity;

  if (newQuantity > oldQuantity) {
    const difference = newQuantity - oldQuantity;
    finalAvailableQuantity = purchaseOrderProduct.quantity_available - difference;

    if (finalAvailableQuantity < 0) {
      throw new Error('Quantity exceeds available stock');
    }
  } else if (newQuantity < oldQuantity) {
    const difference = oldQuantity - newQuantity;
    finalAvailableQuantity = purchaseOrderProduct.quantity_available + difference;
  } else {
    finalAvailableQuantity = purchaseOrderProduct.quantity_available;
  }

  purchaseOrderProduct.quantity_available = finalAvailableQuantity;
  await purchaseOrderProduct.save();

  palletProduct.quantity = newQuantity;
  palletProduct.available_quantity = newQuantity; 
  await palletProduct.save();

  return palletProduct;
})