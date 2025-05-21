const {
  PurchaseOrderProduct,
  Pallet,
  PalletProduct,
  WarehouseLocation,
  Product,
  AmazonProductDetail,
  PurchaseOrder,
} = require("../models");
const asyncHandler = require("../middlewares/async");
const { Op, where } = require("sequelize");
const { Sequelize } = require("sequelize");
const { is } = require("express/lib/request");

exports.createPalletProduct = asyncHandler(
  async ({ purchaseorderproduct_id, pallet_id, quantity, transaction }) => {
    const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
      where: { id: purchaseorderproduct_id },
      transaction,
    });

    const pallet = await Pallet.findOne({
      where: { id: pallet_id },
      transaction,
    });

    if (!pallet) {
      throw new Error("Pallet not found");
    }

    if (!purchaseOrderProduct) {
      throw new Error("Purchase Order Product not found");
    }

    if (quantity > purchaseOrderProduct.quantity_available) {
      throw new Error("Quantity exceeds available stock");
    }

    const palletProduct = await PalletProduct.create(
      {
        purchaseorderproduct_id,
        pallet_id,
        quantity,
        available_quantity: quantity,
      },
      { transaction }
    );

    purchaseOrderProduct.quantity_available -= quantity;
    await purchaseOrderProduct.save({ transaction });

    return palletProduct;
  }
);

exports.updatePalletProduct = asyncHandler(
  async ({ purchaseorderproduct_id, pallet_id, quantity }) => {
    const palletProduct = await PalletProduct.findOne({
      where: {
        pallet_id,
        purchaseorderproduct_id,
      },
    });

    const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
      where: { id: purchaseorderproduct_id },
    });

    if (!palletProduct) {
      throw new Error("PalletProduct not found");
    }

    if (!purchaseOrderProduct) {
      throw new Error("Purchase Order Product not found");
    }

    const oldQuantity = palletProduct.quantity;
    const newQuantity = quantity;
    let finalAvailableQuantity;

    if (newQuantity > oldQuantity) {
      const difference = newQuantity - oldQuantity;
      finalAvailableQuantity =
        purchaseOrderProduct.quantity_available - difference;

      if (finalAvailableQuantity < 0) {
        throw new Error("Quantity exceeds available stock");
      }
    } else if (newQuantity < oldQuantity) {
      const difference = oldQuantity - newQuantity;
      finalAvailableQuantity =
        purchaseOrderProduct.quantity_available + difference;
    } else {
      finalAvailableQuantity = purchaseOrderProduct.quantity_available;
    }

    purchaseOrderProduct.quantity_available = finalAvailableQuantity;
    await purchaseOrderProduct.save();

    palletProduct.quantity = newQuantity;
    palletProduct.available_quantity = newQuantity;
    await palletProduct.save();

    return palletProduct;
  }
);

exports.getPalletProductByPurchaseOrderProductId = asyncHandler(
  async (req, res) => {
    const { purchaseorderproduct_id } = req.params;

    if (!purchaseorderproduct_id) {
      res.status(400);
      throw new Error("purchaseorderproduct_id es requerido");
    }

    // Obtener los valores totales de quantity agrupados por purchaseorderproduct_id
    const totalQuantity = await PalletProduct.findAll({
      attributes: [
        "purchaseorderproduct_id",
        [Sequelize.fn("SUM", Sequelize.col("quantity")), "totalQuantity"],
      ],
      where: { purchaseorderproduct_id },
      group: ["purchaseorderproduct_id"],
    });

    if (!totalQuantity || totalQuantity.length === 0) {
      res.status(404);
      throw new Error(
        "No se encontraron PalletProducts para el purchaseorderproduct_id proporcionado"
      );
    }

    res.status(200).json(totalQuantity[0]);
  }
);

exports.getAllPalletProducts = asyncHandler(async (req, res) => {
  const pallets = await Pallet.findAll({
    attributes: ["id", "pallet_number", "warehouse_location_id", "purchase_order_id"],
    include: [
      {
        model: WarehouseLocation,
        as: "warehouseLocation",
        attributes: ["id", "location"],
      },
      {
        model: PurchaseOrder,
        as: "purchaseOrder",
        attributes: ["id", "order_number", "updatedAt"],
        order: [["updatedAt", "DESC"]],
      },
      {
        model: PalletProduct,
        attributes: [
          "id",
          "purchaseorderproduct_id",
          "quantity",
          "available_quantity",
          "createdAt",
          "updatedAt",
          "pallet_id",
        ],
        where: { available_quantity: { [Op.gt]: 0 }, is_active: true },
        include: [
          {
            model: PurchaseOrderProduct,
            as: "purchaseOrderProduct",
            attributes: ["id"],
            where: { is_active: true },
            include: [
              {
                model: Product,
                attributes: [
                  "product_name",
                  "product_image",
                  "in_seller_account",
                  "upc",
                ],
                include: [
                  {
                    model: AmazonProductDetail,
                    as: "AmazonProductDetail",
                    attributes: ["ASIN", "dangerous_goods"],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  const groupedByPurchaseOrder = pallets.reduce((acc, pallet) => {
    const purchaseOrder = pallet.purchaseOrder;
    const purchaseOrderId = purchaseOrder?.id;

    if (!acc[purchaseOrderId]) {
      acc[purchaseOrderId] = {
        id: purchaseOrder.id,
        order_number: purchaseOrder.order_number,
        pallets: [],
      };
    }

    acc[purchaseOrderId].pallets.push({
      id: pallet.id,
      pallet_number: pallet.pallet_number,
      is_hazmat: pallet.PalletProducts[0]?.purchaseOrderProduct.Product?.AmazonProductDetail?.dangerous_goods,
      warehouse_location: pallet.warehouseLocation?.location || null,
      palletProducts: pallet.PalletProducts.map((palletProduct) => {
        const product = palletProduct.purchaseOrderProduct?.Product || {};
        const detail = product.AmazonProductDetail || {};

        return {
          id: palletProduct.id,
          purchaseorderproduct_id: palletProduct.purchaseorderproduct_id,
          quantity: palletProduct.quantity,
          available_quantity: palletProduct.available_quantity,
          createdAt: palletProduct.createdAt,
          updatedAt: palletProduct.updatedAt,
          pallet_id: palletProduct.pallet_id,
          product: {
            product_name: product.product_name,
            product_image: product.product_image || null,
            seller_sku: product.seller_sku || "",
            ASIN: detail.ASIN || "",
            in_seller_account: !!product.in_seller_account,
            upc: product.upc || null,
          },
        };
      }),
    });

    return acc;
  }, {});

  const response = Object.values(groupedByPurchaseOrder).sort(
    (a, b) => b.pallets[0]?.palletProducts[0]?.updatedAt - a.pallets[0]?.palletProducts[0]?.updatedAt
  );

  return res.status(200).json(response);
});


exports.getPalletProducts = asyncHandler(async (req, res) => {
  const palletProducts = await PalletProduct.findAll({
    where: { pallet_id: req.params.id, is_active: true },
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProduct",
        include: [
          {
            model: Product,
            attributes: ["product_name", "product_image"],
            include: [
              {
                model: AmazonProductDetail,
                as: "AmazonProductDetail",
                attributes: ["ASIN"],
              },
            ],
          },
        ],
      },
      {
        model: Pallet,
        attributes: ["pallet_number", "warehouse_location_id"],
        include: [
          {
            model: WarehouseLocation,
            as: "warehouseLocation",
            attributes: ["location"],
          },
        ],
      },
    ],
  });

  const response = palletProducts.map((palletProduct) => {
    const product = palletProduct.PurchaseOrderProduct?.Product || {};
    const detail = product.AmazonProductDetail || {};

    return {
      id: palletProduct.id,
      purchaseorderproduct_id: palletProduct.purchaseorderproduct_id,
      pallet_id: palletProduct.pallet_id,
      quantity: palletProduct.quantity,
      available_quantity: palletProduct.available_quantity,
      product: {
        ...product,
        ASIN: detail.ASIN || null,
      },
      pallet_number: palletProduct.Pallet.pallet_number || null,
      warehouse_location:
        palletProduct.Pallet.warehouseLocation.location || null,
      createdAt: palletProduct.createdAt,
      updatedAt: palletProduct.updatedAt,
    };
  });

  return res.status(200).json(response);
});
