const { OutgoingShipment, PurchaseOrderProduct, OutgoingShipmentProduct } = require("../models");
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

  const transaction = await sequelize.transaction();

  try {
    const shipment = await OutgoingShipment.findOne({
      where: { id: req.params.id },
      include: [
        {
          model: PurchaseOrderProduct,
          through: { attributes: ["quantity"] },
        },
      ],
      transaction,
    });

    if (!shipment) {
      await transaction.rollback();
      return res.status(404).json({ msg: "Shipment not found" });
    }

    for (let product of shipment.PurchaseOrderProducts) {
      const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
        where: { id: product.id },
        transaction,
      });

      const quantityFromShipment = product.OutgoingShipmentProduct.quantity;

      if (typeof quantityFromShipment === "undefined") {
        throw new Error(
          `Shipment quantity for product ID ${product.id} is undefined.`
        );
      }

      const restoredQuantity =
        purchaseOrderProduct.quantity_available + quantityFromShipment;

      await purchaseOrderProduct.update(
        { quantity_available: restoredQuantity },
        { transaction }
      );
    }

    await shipment.destroy({ transaction });

    await transaction.commit();

    return res.status(204).json({ msg: "Shipment deleted successfully" });
  } catch (error) {
    await transaction.rollback();
    return res
      .status(500)
      .json({ msg: "Something went wrong", error: error.message });
  }
});

// @route   PUT api/v1/shipments/:id
// @desc    Update shipment and adjust available quantities in PurchaseOrderProduct
// @access  Private
exports.updateShipment = asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(401).json({ msg: 'Unauthorized' });
    }

    const shipment = await OutgoingShipment.findOne({
        where: { id: req.params.id },
        include: [{
            model: PurchaseOrderProduct,
            through: { attributes: ['quantity'] }
        }]
    });

    if (!shipment) {
        return res.status(404).json({ msg: 'Shipment not found' });
    }

    const transaction = await sequelize.transaction();

    try {
        const updatedPurchaseOrderProducts = req.body.purchaseorderproducts;

        for (let product of shipment.PurchaseOrderProducts) {
            const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
                where: { id: product.id }
            });

            const updatedProduct = updatedPurchaseOrderProducts.find(item => item.purchase_order_product_id === product.id);
        
            if (updatedProduct) {
                const oldQuantity = product.OutgoingShipmentProduct.quantity;
                const newQuantity = updatedProduct.quantity;
        
                console.log("OLD QUANTITY: ", oldQuantity);
                console.log("NEW QUANTITY: ", newQuantity);

                let currentAvailableQuantity = purchaseOrderProduct.quantity_available
                console.log("CURRENT AV QTY: ", currentAvailableQuantity);

                if (newQuantity > currentAvailableQuantity) {
                    throw new Error(`Quantity of ${newQuantity} exceeds the available stock for product ID ${product.id}. Available stock: ${currentAvailableQuantity}`);
                }

                let finalAvailableQuantity;
                if (newQuantity > oldQuantity) {
                    finalAvailableQuantity = currentAvailableQuantity - (newQuantity - oldQuantity);
                } else if (newQuantity < oldQuantity) {
                    finalAvailableQuantity = currentAvailableQuantity + (oldQuantity - newQuantity);
                } else {
                    finalAvailableQuantity = currentAvailableQuantity;
                }
        
                console.log("FINAL AV QTY: ", finalAvailableQuantity);
        

                await purchaseOrderProduct.update({ quantity_available: finalAvailableQuantity }, { transaction });

                await OutgoingShipmentProduct.update(
                    { quantity: newQuantity },
                    {
                        where: {
                            outgoing_shipment_id: shipment.id,
                            purchase_order_product_id: product.id
                        },
                        transaction
                    }
                );
            }
        }
        
        // 7. Guardar el número de shipment si ha sido modificado
        if (req.body.shipment_number) {
            shipment.shipment_number = req.body.shipment_number;
            await shipment.save({ transaction });
        }
        
        // 8. Confirmar la transacción
        await transaction.commit();
        
        // Obtener el shipment actualizado con los productos asociados
        const updatedShipment = await OutgoingShipment.findOne({
            where: { id: shipment.id },
            include: [{
                model: PurchaseOrderProduct,
                through: { attributes: ['quantity'] }
            }]
        });
        
        return res.status(200).json({
            msg: 'Shipment updated successfully',
            shipment: updatedShipment
        });
        

    } catch (error) {
        await transaction.rollback();
        return res.status(500).json({ msg: 'Something went wrong', error: error.message });
    }
});
