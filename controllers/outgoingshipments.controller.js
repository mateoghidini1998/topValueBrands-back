const { OutgoingShipment, PurchaseOrderProduct } = require("../models");
const asyncHandler = require("../middlewares/async");
const { sequelize } = require("../models");

//@route    POST api/v1/shipments
//@desc     Create an outgoing shipment
//@access   Private
exports.createShipment = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  const existingShipment = await OutgoingShipment.findOne({
    where: { shipment_number: req.body.shipment_number },
  });

  if (existingShipment) {
    return res.status(400).json({ msg: "Shipment already exists" });
  }

  const purchaseOrderProducts = req.body.purchaseorderproducts;

  for (let item of purchaseOrderProducts) {
    const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
      where: { id: item.purchase_order_product_id },
    });

    if (!purchaseOrderProduct) {
      return res.status(404).json({
        msg: `PurchaseOrderProduct with id ${item.purchase_order_product_id} not found`,
      });
    }

    if (item.quantity > purchaseOrderProduct.quantity_available) {
      return res.status(400).json({
        msg: `Quantity of ${item.quantity} exceeds the available quantity of ${purchaseOrderProduct.quantity_available} for product ID ${item.purchase_order_product_id}`,
      });
    }
  }

  const newShipment = await OutgoingShipment.create({
    shipment_number: req.body.shipment_number,
  });

  for (let item of purchaseOrderProducts) {
    const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
      where: { id: item.purchase_order_product_id },
    });

    const newQuantityAvailable =
      purchaseOrderProduct.quantity_available - item.quantity;
    await purchaseOrderProduct.update({
      quantity_available: newQuantityAvailable,
    });

    await newShipment.addPurchaseOrderProduct(item.purchase_order_product_id, {
      through: { quantity: item.quantity },
    });
  }

  const shipmentWithProducts = await OutgoingShipment.findOne({
    where: { id: newShipment.id },
    include: [
      {
        model: PurchaseOrderProduct,
        through: { attributes: ["quantity"] },
      },
    ],
  });

  return res.status(200).json({
    msg: "Shipment created successfully",
    shipment: shipmentWithProducts,
  });
});

//@route    GET api/v1/shipments
//@desc     Get all outgoing shipments
//@access   Private
exports.getShipments = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  const shipments = await OutgoingShipment.findAll({
    include: [
      {
        model: PurchaseOrderProduct,
        through: {
          attributes: ["quantity"],
        },
      },
    ],
  });

  return res.status(200).json({
    shipments,
  });
});

//@route    GET api/v1/shipments
//@desc     Get outgoing shipment by id
//@access   Private
exports.getShipment = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  const shipment = await OutgoingShipment.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: PurchaseOrderProduct,
        through: {
          attributes: ["quantity"],
        },
      },
    ],
  });

  if (!shipment) {
    return res.status(404).json({ msg: "Shipment not found" });
  }
  return res.status(200).json(shipment);
});

//@route    DELETE api/v1/shipments
//@desc     Delete shipment by id
//@access   Private
exports.deleteShipment = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  // Iniciar una transacción para garantizar la consistencia de los datos
  const transaction = await sequelize.transaction();

  try {
    // 1. Verificar si el envío existe
    const shipment = await OutgoingShipment.findOne({
      where: { id: req.params.id },
      include: [
        {
          model: PurchaseOrderProduct,
          through: { attributes: ["quantity"] }, // Acceder a la cantidad en la tabla intermedia
        },
      ],
      transaction, // Aseguramos que esta operación esté dentro de la transacción
    });

    if (!shipment) {
      await transaction.rollback();
      return res.status(404).json({ msg: "Shipment not found" });
    }

    // 2. Actualizar la cantidad disponible en cada producto
    for (let product of shipment.PurchaseOrderProducts) {
      const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
        where: { id: product.id },
        transaction,
      });

      // Obtener la cantidad del envío desde la tabla intermedia
      const quantityFromShipment = product.OutgoingShipmentProduct.quantity;

      // Validar que la cantidad exista antes de proceder
      if (typeof quantityFromShipment === "undefined") {
        throw new Error(
          `Shipment quantity for product ID ${product.id} is undefined.`
        );
      }

      // Actualizar la cantidad disponible
      const restoredQuantity =
        purchaseOrderProduct.quantity_available + quantityFromShipment;

      await purchaseOrderProduct.update(
        { quantity_available: restoredQuantity },
        { transaction }
      );
    }

    // 3. Eliminar el envío
    await shipment.destroy({ transaction });

    // 4. Confirmar la transacción
    await transaction.commit();

    return res.status(204).json({ msg: "Shipment deleted successfully" });
  } catch (error) {
    // Revertir la transacción en caso de error
    await transaction.rollback();
    return res
      .status(500)
      .json({ msg: "Something went wrong", error: error.message });
  }
});
