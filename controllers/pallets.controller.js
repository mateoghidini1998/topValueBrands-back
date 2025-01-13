const { Product, Pallet, PurchaseOrder, WarehouseLocation, PalletProduct, PurchaseOrderProduct, sequelize } = require("../models");
const { createPalletProduct, updatePalletProduct } = require('./palletproducts.controller')
const asyncHandler = require("../middlewares/async");
const { recalculateWarehouseStock } = require('../utils/warehouse_stock_calculator');

//@route    POST api/v1/pallets
//@desc     Create a pallet
//@access   Private
exports.createPallet = asyncHandler(async (req, res) => {
  const { pallet_number, warehouse_location_id, purchase_order_id, products } = req.body;

  if (!products || products.length === 0) {
    return res.status(400).json({ msg: "No products provided to associate with the pallet." });
  }

  const [location, purchase_order, pallet] = await Promise.all([
    WarehouseLocation.findOne({ where: { id: warehouse_location_id } }),
    PurchaseOrder.findOne({ where: { id: purchase_order_id } }),
    Pallet.findOne({ where: { pallet_number } }),
  ]);

  if (!location) {
    return res.status(404).json({ msg: "Warehouse location not found" });
  }

  if (location.current_capacity <= 0) {
    return res.status(400).json({ msg: `The location with id ${warehouse_location_id} has no space available` });
  }

  if (!purchase_order) {
    return res.status(404).json({ msg: "Purchase order not found" });
  }

  if (pallet) {
    return res.status(400).json({ msg: "Pallet Number already exists" });
  }

  const transaction = await sequelize.transaction();

  try {
    const newPallet = await Pallet.create(
      { pallet_number, warehouse_location_id, purchase_order_id },
      { transaction }
    );

    location.current_capacity -= 1;
    await location.save({ transaction });

    const productsToUpdate = new Set();

    const palletProductsData = [];

    for (const { purchaseorderproduct_id, quantity } of products) {
      const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
        where: { id: purchaseorderproduct_id },
        transaction,
      });

      if (!purchaseOrderProduct) {
        throw new Error(`PurchaseOrderProduct with ID ${purchaseorderproduct_id} not found.`);
      }

      productsToUpdate.add(purchaseOrderProduct.product_id);

      palletProductsData.push({
        purchaseorderproduct_id,
        pallet_id: newPallet.id,
        quantity,
      });
    }

    await PalletProduct.bulkCreate(palletProductsData, { transaction });

    await Promise.all([...productsToUpdate].map(productId => recalculateWarehouseStock(productId)));

    await transaction.commit();

    return res.status(201).json({ pallet: newPallet });
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
  try {
    const pallets = await Pallet.findAll({
      include: [
        {
          model: PurchaseOrderProduct,
          as: 'purchaseorderproducts',
          through: {
            model: PalletProduct,
            attributes: ['quantity', 'available_quantity'],
          },
          attributes: ['id'],
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

    return res.status(200).json({
      count: pallets.length,
      pallets: pallets.map((pallet) => {
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
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching pallets:', error);
    return res.status(500).json({ message: 'Error fetching pallets' });
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
  const pallet = await Pallet.findOne({ where: { id: req.params.id } });

  if (!pallet) {
    return res.status(404).json({ msg: "Pallet not found" });
  }

  let location = await WarehouseLocation.findOne({ where: { id: pallet.warehouse_location_id } });

  if (!location) {
    return res.status(404).json({ msg: "Location not found" });
  }

  location.current_capacity += 1;
  await location.save();

  await pallet.destroy();

  return res.status(204).end();
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


