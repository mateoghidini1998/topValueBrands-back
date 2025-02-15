const { Product, Pallet, PurchaseOrder, WarehouseLocation, PalletProduct, PurchaseOrderProduct, sequelize } = require("../models");
const palletService = require("../services/pallets.service")
const { updatePalletProduct } = require('./palletproducts.controller')
const asyncHandler = require("../middlewares/async");
const { Op } = require("sequelize");

//@route    POST api/v1/pallets
//@desc     Create a pallet
//@access   Private
exports.createPallet = asyncHandler(async (req, res) => {
  try {
    const palletData = req.body
    const pallet = await palletService.createPallet(palletData)
    return res.status(201).json({
      message: "Pallet created successfully",
      pallet,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error creating pallet",
      error: error.message,
    });
  }
});

//@route    GET api/v1/pallets
//@desc     Get pallets
//@access   Private
exports.getPallets = asyncHandler(async (req, res) => {
  try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const keyword = req.query.keyword || '';
      const warehouse_location = req.query.warehouse_location || null;
      const orderBy = req.query.orderBy || 'updatedAt';
      const orderWay = req.query.orderWay || 'DESC';
  
      const pallets = await palletService.findAll({ page, limit, keyword, warehouse_location, orderBy, orderWay });
  
      return res.status(200).json({
        success: true,
        ...pallets,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        msg: 'Error fetching pallets',
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
            as: 'purchaseOrderProduct',
            attributes: [
              'id',
            ],
            include: [
              {
                model: Product,
                attributes: ['product_name', 'product_image', 'seller_sku', "in_seller_account"],
              },
            ],
          },
        ],
      },
      {
        model: WarehouseLocation,
        as: 'warehouseLocation',
        attributes: ['id', 'location'],
      },
      {
        model: PurchaseOrder,
        as: 'purchaseOrder',
        attributes: ['id', 'order_number'],
      },
    ],
  });

  if (!pallet) {
    return res.status(404).json({ msg: "Pallet not found" });
  }

  // Convierte a un objeto plano para manipulación
  const palletData = pallet.toJSON();

  // Procesa los datos para incluir los campos de Product directamente en PalletProducts
  const formattedPallet = {
    ...palletData,
    PalletProducts: palletData.PalletProducts.map((palletProduct) => {
      // const product =
      //   palletProduct.PurchaseOrderProduct?.Product || {};
      return {
        ...palletProduct,
      };
    }),
  };

  return res.status(200).json(formattedPallet);
});

//@route    DELETE api/v1/pallets/:id
//@desc     Delete pallet by id
//@access   Private
exports.deletePallet = asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const result = await palletService.deletePallet(id)
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});


//@route    PUT api/v1/pallets/:id
//@desc     update pallet by id
//@access   Private
exports.updatePallet = asyncHandler(async (req, res) => {
  const { pallet_number, warehouse_location_id, purchase_order_id, products } = req.body;

  let pallet = await Pallet.findOne({ where: { id: req.params.id } });
  let newLocation = await WarehouseLocation.findOne({ where: { id: warehouse_location_id } });
  let purchase_order = await PurchaseOrder.findOne({ where: { id: purchase_order_id } });

  if (!pallet) {
    return res.status(404).json({ msg: "Pallet not found" });
  }

  if (!newLocation) {
    return res.status(404).json({ msg: "Warehouse location not found" });
  }

  if (!purchase_order) {
    return res.status(404).json({ msg: "Purchase order not found" });
  }

  if (pallet.warehouse_location_id !== warehouse_location_id && newLocation.current_capacity <= 0) {
    return res.status(400).json({
      msg: `The location with id ${warehouse_location_id} has no space available`,
    });
  }

  let oldLocation = await WarehouseLocation.findOne({ where: { id: pallet.warehouse_location_id } });

  await pallet.update({
    pallet_number: pallet_number || pallet.pallet_number,
    warehouse_location_id: warehouse_location_id || pallet.warehouse_location_id,
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
    const showAvailable = req.query.available === 'true';

    // Buscar las ubicaciones en la base de datos
    const locations = await WarehouseLocation.findAll({
      attributes: ['id', 'location', 'capacity', 'current_capacity'],
      where: showAvailable ? { current_capacity: { [Op.gt]: 0 } } : {},
      order: [['location', 'ASC']],
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