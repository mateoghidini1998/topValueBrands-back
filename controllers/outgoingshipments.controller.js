const { OutgoingShipment, PalletProduct, OutgoingShipmentProduct, PurchaseOrderProduct, Product } = require("../models");
const asyncHandler = require("../middlewares/async");
const { sequelize } = require("../models");
const ExcelJS = require('exceljs')
const path = require('path')
const fs = require('fs')

//@route    POST api/v1/shipments
//@desc     Create an outgoing shipment
//@access   Private
exports.createShipment = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  // Comprobar si el envío ya existe
  const existingShipment = await OutgoingShipment.findOne({
    where: { shipment_number: req.body.shipment_number },
  });

  if (existingShipment) {
    return res.status(400).json({ msg: "Shipment already exists" });
  }

  const palletProducts = req.body.palletproducts;

  // Verificar si la cantidad solicitada no excede la cantidad disponible
  for (let item of palletProducts) {
    const palletProduct = await PalletProduct.findOne({
      where: { id: item.pallet_product_id },
    });

    if (!palletProduct) {
      return res.status(404).json({
        msg: `PalletProduct with id ${item.pallet_product_id} not found`,
      });
    }

    if (item.quantity > palletProduct.available_quantity) {
      return res.status(400).json({
        msg: `Quantity of ${item.quantity} exceeds the available quantity of ${palletProduct.available_quantity} for product ID ${item.pallet_product_id}`,
      });
    }
  }

  // Crear el nuevo envío
  const newShipment = await OutgoingShipment.create({
    shipment_number: req.body.shipment_number,
    status: 'PENDING',
  });

  // Reducir las cantidades disponibles y asociar los productos al envío
  for (let item of palletProducts) {
    const palletProduct = await PalletProduct.findOne({
      where: { id: item.pallet_product_id },
    });

    const newAvailableQuantity = palletProduct.available_quantity - item.quantity;

    await palletProduct.update({
      available_quantity: newAvailableQuantity,
    });

    // Asociar el producto con el envío usando OutgoingShipmentProduct
    await OutgoingShipmentProduct.create({
      outgoing_shipment_id: newShipment.id,
      pallet_product_id: item.pallet_product_id,
      quantity: item.quantity,
    });
  }

  // Obtener el envío con los productos asociados para incluir la cantidad en la respuesta
  const shipmentWithProducts = await OutgoingShipment.findOne({
    where: { id: newShipment.id },
    include: [
      {
        model: PalletProduct,
        attributes: [
          'id', // Asegura que el id del PalletProduct (pallet_product_id) esté incluido
          'purchaseorderproduct_id',
          'pallet_id',
          'quantity',
          'available_quantity',
          'createdAt',
          'updatedAt'
        ],
        through: { attributes: ["quantity"] }, // Cantidad de OutgoingShipmentProduct
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
        model: PalletProduct,
        attributes: [
          'id',
          'purchaseorderproduct_id',
          'pallet_id',
          'quantity',
          'available_quantity',
          'createdAt',
          'updatedAt'
        ],
        through: { attributes: ["quantity"] },
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
        model: PalletProduct,
        attributes: [
          'id', // Asegura que el id del PalletProduct (pallet_product_id) esté incluido
          'purchaseorderproduct_id',
          'pallet_id',
          'quantity',
          'available_quantity',
          'createdAt',
          'updatedAt'
        ],
        through: { attributes: ["quantity"] }, // Cantidad de OutgoingShipmentProduct
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
          model: PalletProduct,
          attributes: [
            'id', 
            'purchaseorderproduct_id',
            'pallet_id',
            'quantity',
            'available_quantity',
            'createdAt',
            'updatedAt'
          ],
          through: { attributes: ["quantity"] }, 
        },
      ],
      transaction
    });

    if (!shipment) {
      await transaction.rollback();
      return res.status(404).json({ msg: "Shipment not found" });
    }

    for (let product of shipment.PalletProducts) {
      const palletProduct = await PalletProduct.findOne({
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
        palletProduct.available_quantity + quantityFromShipment;

      await palletProduct.update(
        { available_quantity: restoredQuantity },
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
            model: PalletProduct,
            through: { attributes: ['quantity'] }
        }]
    });

    if (!shipment) {
        return res.status(404).json({ msg: 'Shipment not found' });
    }

    const transaction = await sequelize.transaction();

    try {
        const updatedPalletProducts = req.body.palletProducts;

        for (let product of shipment.PalletProducts) {
            const palleProduct = await PalletProduct.findOne({
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


exports.download2DWorkflowTemplate = asyncHandler(async (req, res) => {
  const shipmentId = req.params.id;

  // Buscar el shipment con sus productos asociados
  const shipment = await OutgoingShipment.findOne({
    where: { id: shipmentId },
    include: [
      {
        model: PalletProduct,
        attributes: [
          'id',
          'purchaseorderproduct_id',
          'available_quantity',
          'quantity',
        ],
        include: [
          {
            model: PurchaseOrderProduct,
            attributes: ['product_id'],
            include: [
              {
                model: Product,
                attributes: ['seller_sku'], // Campo SKU desde Product
              },
            ],
          },
        ],
        through: { attributes: ["quantity"] },
      },
    ],
  });

  if (!shipment) {
    return res.status(404).json({ msg: "Shipment not found" });
  }

  const templatePath = path.join(
    __dirname,
    '..',
    'templates',
    '2DWorkflow_Create_Shipment_Template.xlsx'
  );

  if (!fs.existsSync(templatePath)) {
    return res.status(500).json({ msg: "Template not found" });
  }

  // Crear el workbook usando el template
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  // Seleccionar la primera hoja del workbook
  const worksheet = workbook.getWorksheet(1);

  // Agregar los datos al Excel
  shipment.PalletProducts.forEach((product, index) => {
    const rowIndex = index + 2; // Comenzar en la segunda fila después del encabezado
    const sku =
      product.PurchaseOrderProduct?.Product?.seller_sku || "N/A"; // SKU desde Product
    const qty = product.OutgoingShipmentProduct?.quantity || 0; // QTY
    const unitsPerCase = 1; // UNITS_PER_CASE

    const row = worksheet.getRow(rowIndex);
    row.getCell(1).value = sku; // Columna SKU
    row.getCell(2).value = qty; // Columna QTY
    row.getCell(3).value = unitsPerCase; // Columna UNITS_PER_CASE
    row.commit();
  });

  // Generar un nombre único para el archivo
  const fileName = `Shipment_${shipment.shipment_number}.xlsx`;
  const savePath = path.join(__dirname, '..', 'exports', fileName);

  // Guardar el archivo en el servidor
  await workbook.xlsx.writeFile(savePath);

  // Descargar el archivo al cliente
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${fileName}`
  );
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  await workbook.xlsx.write(res); // Escribir directamente al cliente
  res.end();
});