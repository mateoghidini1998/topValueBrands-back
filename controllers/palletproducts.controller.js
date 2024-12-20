const { PurchaseOrderProduct, Pallet, PalletProduct, WarehouseLocation, Product } = require('../models');
const asyncHandler = require("../middlewares/async");
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');

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

exports.getPalletProductByPurchaseOrderProductId = asyncHandler(async (req, res) => {
  const { purchaseorderproduct_id } = req.params;

  if (!purchaseorderproduct_id) {
    res.status(400);
    throw new Error('purchaseorderproduct_id es requerido');
  }

  // Obtener los valores totales de quantity agrupados por purchaseorderproduct_id
  const totalQuantity = await PalletProduct.findAll({
    attributes: [
      'purchaseorderproduct_id',
      [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalQuantity'],
    ],
    where: { purchaseorderproduct_id },
    group: ['purchaseorderproduct_id'],
  });

  if (!totalQuantity || totalQuantity.length === 0) {
    res.status(404);
    throw new Error('No se encontraron PalletProducts para el purchaseorderproduct_id proporcionado');
  }

  res.status(200).json(totalQuantity[0]);
});


exports.getAllPalletProducts = asyncHandler(async (req, res) => {
  const palletProducts = await PalletProduct.findAll({
    attributes: ['id', 'purchaseorderproduct_id', 'pallet_id', 'quantity', 'available_quantity', 'createdAt', 'updatedAt'],
    include: [
      {
        model: PurchaseOrderProduct,
        include: [
          {
            model: Product,
            attributes: ['product_name', 'product_image', 'seller_sku', 'ASIN', 'in_seller_account'],
          },
        ],
      },
      {
        model: Pallet,
        attributes: ['pallet_number', 'warehouse_location_id'],
        include: [
          {
            model: WarehouseLocation,
            as: 'warehouseLocation',
            attributes: ['location'],
          },
        ],
      },
    ],
  });

  // Mapeo de datos para estructurar la respuesta como se requiere
  const response = palletProducts.map((palletProduct) => ({
    id: palletProduct.id,
    purchaseorderproduct_id: palletProduct.purchaseorderproduct_id,
    pallet_id: palletProduct.pallet_id,
    quantity: palletProduct.quantity,
    available_quantity: palletProduct.available_quantity,
    product: palletProduct.PurchaseOrderProduct?.Product || null,
    pallet_number: palletProduct.Pallet.pallet_number || null,
    warehouse_location: palletProduct.Pallet.warehouseLocation.location || null,
    createdAt: palletProduct.createdAt,
    updatedAt: palletProduct.updatedAt,
  }));

  return res.status(200).json(response);
});

exports.getPalletProducts = asyncHandler(async (req, res) => {
  const palletProducts = await PalletProduct.findAll({
    where: { pallet_id: req.params.id },
    include: [
      {
        model: PurchaseOrderProduct,
        include: [
          {
            model: Product,
            attributes: ['product_name', 'product_image', 'seller_sku', 'ASIN'],
          },
        ],
      },
      {
        model: Pallet,
        attributes: ['pallet_number', 'warehouse_location_id'],
        include: [
          {
            model: WarehouseLocation,
            as: 'warehouseLocation',
            attributes: ['location'],
          },
        ],
      },
    ],
  });

  // Mapeo de datos para estructurar la respuesta como se requiere
  const response = palletProducts.map((palletProduct) => ({
    id: palletProduct.id,
    purchaseorderproduct_id: palletProduct.purchaseorderproduct_id,
    pallet_id: palletProduct.pallet_id,
    quantity: palletProduct.quantity,
    available_quantity: palletProduct.available_quantity,
    product: palletProduct.PurchaseOrderProduct?.Product || null,
    pallet_number: palletProduct.Pallet.pallet_number || null,
    warehouse_location: palletProduct.Pallet.warehouseLocation.location || null,
    createdAt: palletProduct.createdAt,
    updatedAt: palletProduct.updatedAt,
  }));

  return res.status(200).json(response);
});