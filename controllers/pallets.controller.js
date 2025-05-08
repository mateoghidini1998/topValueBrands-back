const {
  Product,
  Pallet,
  PurchaseOrder,
  WarehouseLocation,
  PalletProduct,
  AmazonProductDetail,
  PurchaseOrderProduct,
  OutgoingShipmentProduct,
  sequelize,
} = require("../models");
const {
  createPalletProduct,
  updatePalletProduct,
} = require("./palletproducts.controller");
const asyncHandler = require("../middlewares/async");
const {
  recalculateWarehouseStock,
} = require("../utils/warehouse_stock_calculator");
const { Op } = require("sequelize");

//@route    POST api/v1/pallets
//@desc     Create a pallet
//@access   Private

exports.createPallet = asyncHandler(async (req, res) => {
  const { pallet_number, warehouse_location_id, purchase_order_id, products } =
    req.body;

  const transaction = await sequelize.transaction();

  try {
    const location = await WarehouseLocation.findOne({
      where: { id: warehouse_location_id },
    });
    const purchase_order = await PurchaseOrder.findOne({
      where: { id: purchase_order_id },
    });

    let pallet = await Pallet.findOne({ where: { pallet_number } });

    if (!location) {
      return res.status(404).json({ msg: "Warehouse location not found" });
    }

    if (location.current_capacity <= 0) {
      return res.status(400).json({
        msg: `The location ${location} has no space available`,
      });
    }

    if (!purchase_order) {
      return res.status(404).json({ msg: "Purchase order not found" });
    }

    if (pallet) {
      return res.status(400).json({ msg: "Pallet Number already exists" });
    }

    pallet = await Pallet.create(
      { pallet_number, warehouse_location_id, purchase_order_id },
      { transaction }
    );

    location.current_capacity -= 1;
    await location.save({ transaction });

    if (products && products.length > 0) {
      const productsToUpdate = new Set(); // Usaremos un Set para recalcular solo los productos afectados

      for (const product of products) {
        const { purchaseorderproduct_id, quantity } = product;

        // Crear la relación del pallet con el producto
        await createPalletProduct({
          purchaseorderproduct_id,
          pallet_id: pallet.id,
          quantity,
          transaction,
        });

        // Obtener el producto asociado al purchaseorderproduct_id
        const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
          where: { id: purchaseorderproduct_id },
          transaction,
        });

        if (!purchaseOrderProduct) {
          throw new Error(
            `PurchaseOrderProduct with ID ${purchaseorderproduct_id} not found.`
          );
        }

        // Añadir el product_id al Set para recalcular warehouse_stock
        productsToUpdate.add(purchaseOrderProduct.product_id);
      }

      // Recalcular warehouse_stock para cada producto afectado
      for (const productId of productsToUpdate) {
        await recalculateWarehouseStock(productId);
      }
    } else {
      return res
        .status(400)
        .json({ msg: "No products provided to associate with the pallet." });
    }

    await transaction.commit();

    return res.status(201).json({ pallet });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({
      msg: "Error creating pallet and updating warehouse stock",
      error: error.message,
    });
  }
});

//@route    GET api/v1/pallets
//@desc     Get pallets
//@access   Private
exports.getPallets = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const palletNumber = req.query.pallet_number || "";
  const warehouseLocationId = req.query.warehouse_location_id || null;
  const orderBy = req.query.orderBy || "updatedAt";
  const orderWay = req.query.orderWay || "DESC";

  try {
    const whereConditions = { is_active: true };

    if (palletNumber) {
      whereConditions.pallet_number = { [Op.like]: `%${palletNumber}%` };
    }

    if (warehouseLocationId) {
      whereConditions.warehouse_location_id = warehouseLocationId;
    }

    const { count, rows: pallets } = await Pallet.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: PurchaseOrderProduct,
          as: "purchaseorderproducts",
          through: {
            model: PalletProduct,
            attributes: ["quantity", "available_quantity"],
          },
          attributes: ["id"],
          include: [
            {
              model: Product,
              attributes: ["product_name", "product_image"],
              include: [
                {
                  model: AmazonProductDetail,
                  as: "AmazonProductDetail",
                  attributes: ["ASIN", "seller_sku", "dangerous_goods"],
                },
              ],
            },
          ],
        },
        {
          model: WarehouseLocation,
          as: "warehouseLocation",
          attributes: ["id", "location"],
        },
        {
          model: PurchaseOrder,
          as: "purchaseOrder",
          attributes: ["id", "order_number"],
        },
      ],
      distinct: true, // <- Agregado para evitar conteo incorrecto
      limit,
      offset,
      order: [[orderBy, orderWay]],
    });

    // pallets.storage_type = pallets.purchaseorderproducts[0].product.dangerous_goods; // Asignar storage_type al primer producto del pallet

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      success: true,
      total: count,
      pages: totalPages,
      currentPage: page,
      data: pallets.map((pallet) => {
        const firstProduct = pallet.purchaseorderproducts[0]?.Product || {};
        const detail = firstProduct.AmazonProductDetail || {};

        return {
          id: pallet.id,
          pallet_number: pallet.pallet_number,
          warehouse_location_id: pallet.warehouse_location_id,
          warehouse_location: pallet.warehouseLocation.location,
          purchase_order_number: pallet.purchaseOrder.order_number,
          purchase_order_id: pallet.purchase_order_id,
          createdAt: pallet.createdAt,
          updatedAt: pallet.updatedAt,
          products: pallet.purchaseorderproducts,
          storage_type: detail.dangerous_goods || null,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching pallets:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching pallets",
      error: error.message,
    });
  }
});

//@route    GET api/v1/pallets/:id
//@desc     Get pallet by id
//@access   Private
exports.getPallet = asyncHandler(async (req, res) => {
  const pallet = await Pallet.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: PalletProduct,
        where: { is_active: true },
        include: [
          {
            model: PurchaseOrderProduct,
            as: "purchaseOrderProduct",
            attributes: ["id", "expire_date"],
            include: [
              {
                model: Product,
                attributes: [
                  "product_name",
                  "product_image",
                  "in_seller_account",
                  "upc",
                  "pack_type",
                ],
                include: [
                  {
                    model: AmazonProductDetail,
                    as: "AmazonProductDetail",
                    attributes: ["ASIN", "seller_sku", "dangerous_goods"],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        model: WarehouseLocation,
        as: "warehouseLocation",
        attributes: ["id", "location"],
      },
      {
        model: PurchaseOrder,
        as: "purchaseOrder",
        attributes: ["id", "order_number"],
      },
    ],
  });

  if (!pallet) {
    return res.status(404).json({ msg: "Pallet not found" });
  }

  const palletData = pallet.toJSON();

  const formattedPallet = {
    ...palletData,
    PalletProducts: palletData.PalletProducts.map((palletProduct) => {
      const product = palletProduct.PurchaseOrderProduct?.Product || {};
      const detail = product.AmazonProductDetail || {};

      return {
        ...palletProduct,
        product_name: product.product_name || null,
        product_image: product.product_image || null,
        seller_sku: detail.seller_sku || null,
        ASIN: detail.ASIN || null,
        upc: product.upc || null,
        pack_type: product.pack_type || null,
        in_seller_account: product.in_seller_account || null,
        expire_date: palletProduct.PurchaseOrderProduct?.expire_date || null,
      };
    }),
  };

  return res.status(200).json(formattedPallet);
});


//@route    DELETE api/v1/pallets/:id
//@desc     Delete pallet by id
//@access   Private
exports.deletePallet = asyncHandler(async (req, res) => {
  const pallet = await Pallet.findOne({ where: { id: req.params.id } });

  if (!pallet) {
    return res.status(404).json({ msg: "Pallet not found" });
  }

  const purchaseOrder = await PurchaseOrder.findOne({
    where: { id: pallet.purchase_order_id },
  });

  if (!purchaseOrder) {
    return res.status(404).json({ msg: "Purchase Order not found" });
  }

  const palletProducts = await PalletProduct.findAll({
    where: { pallet_id: pallet.id },
  });

  // Verify that pallet products are not associated with any outgoingshipmentproduct
  for (const palletProduct of palletProducts) {
    const outgoingShipmentProduct = await OutgoingShipmentProduct.findOne({
      where: { pallet_product_id: palletProduct.id },
    });

    if (outgoingShipmentProduct) {
      return res
        .status(400)
        .json({ msg: "Pallet is associated with an outgoing shipment" });
    }
  }

  // Restore purchaseorderproducts quantity_avaialable with the corresponding palletproduct quantity
  for (const palletProduct of palletProducts) {
    const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
      where: { id: palletProduct.purchaseorderproduct_id },
    });

    if (!purchaseOrderProduct) {
      return res.status(404).json({ msg: "Purchase Order Product not found" });
    }

    await purchaseOrderProduct.update({
      quantity_available:
        purchaseOrderProduct.quantity_available + palletProduct.quantity,
    });
  }

  let location = await WarehouseLocation.findOne({
    where: { id: pallet.warehouse_location_id },
  });

  if (!location) {
    return res.status(404).json({ msg: "Location not found" });
  }

  location.current_capacity += 1;
  await location.save();

  await pallet.destroy();

  return res.status(200).json({ msg: "Pallet deleted" });
});

//@route    PUT api/v1/pallets/:id
//@desc     update pallet by id
//@access   Private
exports.updatePallet = asyncHandler(async (req, res) => {
  const { pallet_number, warehouse_location_id, purchase_order_id, products } =
    req.body;

  let pallet = await Pallet.findOne({ where: { id: req.params.id } });
  let newLocation = await WarehouseLocation.findOne({
    where: { id: warehouse_location_id },
  });
  let purchase_order = await PurchaseOrder.findOne({
    where: { id: purchase_order_id },
  });

  if (!pallet) {
    return res.status(404).json({ msg: "Pallet not found" });
  }

  if (!newLocation) {
    return res.status(404).json({ msg: "Warehouse location not found" });
  }

  if (!purchase_order) {
    return res.status(404).json({ msg: "Purchase order not found" });
  }

  if (
    pallet.warehouse_location_id !== warehouse_location_id &&
    newLocation.current_capacity <= 0
  ) {
    return res.status(400).json({
      msg: `The location with id ${warehouse_location_id} has no space available`,
    });
  }

  let oldLocation = await WarehouseLocation.findOne({
    where: { id: pallet.warehouse_location_id },
  });

  await pallet.update({
    pallet_number: pallet_number || pallet.pallet_number,
    warehouse_location_id:
      warehouse_location_id || pallet.warehouse_location_id,
    purchase_order_id: purchase_order_id || pallet.purchase_order_id,
  });

  if (pallet.warehouse_location_id !== warehouse_location_id) {
    newLocation.current_capacity -= 1;
    await newLocation.save();

    oldLocation.current_capacity += 1;
    await oldLocation.save();
  }

  if (products && products.length > 0) {
    for (const product of products) {
      const { purchaseorderproduct_id, quantity } = product;

      await updatePalletProduct({
        pallet_id: pallet.id,
        purchaseorderproduct_id,
        quantity,
      });
    }
  }

  return res.status(200).json({ msg: "Pallet updated successfully", pallet });
});

exports.getAvailableLocations = asyncHandler(async (req, res) => {
  try {
    // Leer el parámetro desde la query string
    const showAvailable = req.query.available === "true";

    // Buscar las ubicaciones en la base de datos
    const locations = await WarehouseLocation.findAll({
      attributes: ["id", "location", "capacity", "current_capacity"],
      where: showAvailable ? { current_capacity: { [Op.gt]: 0 } } : {},
      order: [["location", "ASC"]],
    });

    // Responder con los datos encontrados
    return res.status(200).json({
      success: true,
      msg: "Locations retrieved successfully",
      data: locations,
    });
  } catch (error) {
    console.error(error);

    // Manejar errores
    return res.status(500).json({
      success: false,
      msg: "An error occurred while retrieving locations",
    });
  }
});

exports.updatePalletLocation = asyncHandler(async (req, res) => {
  const { warehouse_location_id } = req.body;
  const { palletId } = req.params;

  const pallet = await Pallet.findByPk(palletId);

  if (!pallet) {
    return res.status(404).json({ msg: "Pallet not found" });
  }

  let oldLocation = await WarehouseLocation.findOne({
    where: { id: pallet.warehouse_location_id },
  });
  let newLocation = await WarehouseLocation.findOne({
    where: { id: warehouse_location_id },
  });

  if (!oldLocation) {
    return res.status(404).json({ msg: "Old location not found" });
  }

  if (!newLocation || newLocation.current_capacity <= 0) {
    return res.status(404).json({ msg: "New location is not available" });
  }

  await pallet.update({
    warehouse_location_id: warehouse_location_id,
  });

  oldLocation.current_capacity += 1;
  await oldLocation.save();

  newLocation.current_capacity -= 1;
  await newLocation.save();

  return res.status(200).json({ msg: "Pallet location updated successfully" });
});
