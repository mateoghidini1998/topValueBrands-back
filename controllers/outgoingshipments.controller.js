const { OutgoingShipment, PalletProduct, OutgoingShipmentProduct, PurchaseOrderProduct, Product, Pallet, PurchaseOrder } = require("../models");
const asyncHandler = require("../middlewares/async");
const { sequelize } = require("../models");
const ExcelJS = require('exceljs')
const path = require('path')
const fs = require('fs');
const { where, Op } = require("sequelize");
const req = require("express/lib/request");
const axios = require('axios')
const { fetchNewTokenForFees } = require('../middlewares/lwa_token');
const logger = require("../logger/logger");

//@route    POST api/v1/shipments
//@desc     Create an outgoing shipment
//@access   Private
exports.createShipment = asyncHandler(async (req, res) => {
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

//@route    POST api/v1/shipments/po/:id
//@desc     Create an outgoing shipment from a purchase order
//@access   Private
exports.createShipmentByPurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { shipment_number } = req.body;

  const existingShipment = await OutgoingShipment.findOne({
    where: { shipment_number },
  });

  if (existingShipment) {
    return res.status(400).json({ msg: "Shipment already exists" });
  }

  const palletProducts = await PalletProduct.findAll({
    attributes: ["id", "purchaseorderproduct_id", "pallet_id", "quantity", "available_quantity"],
    include: [
      {
        model: sequelize.models.Pallet,
        where: { purchase_order_id: id },
      },
    ],
    where: {
      available_quantity: { [Op.gt]: 0 },
    },
  });

  if (palletProducts.length === 0) {
    return res.status(404).json({
      msg: `No PalletProducts with available quantity > 0 found for PurchaseOrder ID ${id}`,
    });
  }

  const newShipment = await OutgoingShipment.create({
    shipment_number,
    status: "PENDING",
  });

  for (let palletProduct of palletProducts) {
    const { id: palletProductId, available_quantity } = palletProduct;

    if (available_quantity > 0) {
      await palletProduct.update({
        available_quantity: 0,
      });

      await OutgoingShipmentProduct.create({
        outgoing_shipment_id: newShipment.id,
        pallet_product_id: palletProductId,
        quantity: available_quantity,
      });
    }
  }

  const shipmentWithProducts = await OutgoingShipment.findOne({
    where: { id: newShipment.id },
    include: [
      {
        model: PalletProduct,
        attributes: [
          "id",
          "purchaseorderproduct_id",
          "pallet_id",
          "quantity",
          "available_quantity",
          "createdAt",
          "updatedAt",
        ],
        through: { attributes: ["quantity"] },
      },
    ],
  });

  return res.status(200).json({
    msg: "Shipment created successfully from PurchaseOrder",
    shipment: shipmentWithProducts,
  });
});

//@route    GET api/v1/shipments
//@desc     Get all outgoing shipments
//@access   Private
exports.getShipments = asyncHandler(async (req, res) => {
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
  // if (req.user.role !== "admin") {
  //   return res.status(401).json({ msg: "Unauthorized" });
  // }

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
          'updatedAt',
        ],
        through: { attributes: ["quantity"] }, // Cantidad de OutgoingShipmentProduct
        include: [
          {
            model: PurchaseOrderProduct,
            attributes: ['id', 'product_id'], // Incluye el product_id
            include: [
              {
                model: Product,
                attributes: ['id', 'product_name', 'product_image', 'seller_sku', 'in_seller_account'], // Incluye el product_name
              },
            ],
          },
        ],
      },
    ],
  });

  if (!shipment) {
    return res.status(404).json({ msg: "Shipment not found" });
  }

  // Convierte `shipment` a un objeto plano
  const shipmentData = shipment.toJSON();

  // Reorganiza los datos
  const formattedShipment = {
    ...shipmentData,
    PalletProducts: shipmentData.PalletProducts.map((palletProduct) => {
      const productName =
        palletProduct.PurchaseOrderProduct?.Product?.product_name || null;

      const productImage =
        palletProduct.PurchaseOrderProduct?.Product?.product_image || null;

      const sellerSku =
        palletProduct.PurchaseOrderProduct?.Product?.seller_sku || null;
      const in_seller_account =
        palletProduct.PurchaseOrderProduct?.Product?.in_seller_account || null;

      return {
        ...palletProduct,
        product_name: productName, // Agrega el campo directamente aquí
        product_image: productImage, // Agrega el campo directamente aquí
        seller_sku: sellerSku, // Agrega el campo directamente aquí
        in_seller_account: in_seller_account,
        PurchaseOrderProduct: undefined, // Opcional: elimina datos anidados innecesarios
      };
    }),
  };

  // Envía los datos procesados
  return res.status(200).json(formattedShipment);
});

//@route    DELETE api/v1/shipments
//@desc     Delete shipment by id
//@access   Private
exports.deleteShipment = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const shipment = await OutgoingShipment.findOne({
      where: { id: req.params.id },
      transaction,
    });

    if (!shipment) {
      await transaction.rollback();
      return res.status(404).json({ msg: "Shipment not found" });
    }

    await revertWarehouseStockForShipment(shipment);

    await shipment.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({ msg: "Shipment deleted successfully" });
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
                attributes: ['seller_sku'],
              },
            ],
          },
        ],
        through: { attributes: ['quantity'] },
      },
    ],
  });

  if (!shipment) {
    return res.status(404).json({ msg: 'Shipment not found' });
  }

  const templatePath = path.join(
    __dirname,
    '..',
    'templates',
    '2DWorkflow_Create_Shipment_Template.xlsx'
  );

  if (!fs.existsSync(templatePath)) {
    return res.status(500).json({ msg: 'Template not found' });
  }

  // Crear el workbook usando el template
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  // Seleccionar la primera hoja del workbook
  const worksheet = workbook.getWorksheet(1);

  // Agrupar los productos por seller_sku y sumar quantities
  const aggregatedProducts = {};

  shipment.PalletProducts.forEach((product) => {
    const sellerSku =
      product.PurchaseOrderProduct?.Product?.seller_sku || 'N/A';
    const quantity = product.OutgoingShipmentProduct?.quantity || 0;

    if (aggregatedProducts[sellerSku]) {
      aggregatedProducts[sellerSku].quantity += quantity;
    } else {
      aggregatedProducts[sellerSku] = {
        sellerSku,
        quantity,
        unitsPerCase: 1, // Valor constante para UNITS_PER_CASE
      };
    }
  });

  // Escribir los datos agrupados en el Excel
  let rowIndex = 2; // Comenzar en la segunda fila después del encabezado
  Object.values(aggregatedProducts).forEach((product) => {
    const row = worksheet.getRow(rowIndex);
    row.getCell(1).value = product.sellerSku; // Columna SKU
    row.getCell(2).value = product.quantity; // Columna QTY
    row.getCell(3).value = product.unitsPerCase; // Columna UNITS_PER_CASE
    row.commit();
    rowIndex++;
  });

  // Generar un nombre único para el archivo
  const fileName = `2DWorkflow_Shipment_${shipment.shipment_number}.xlsx`;
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

//@route    GET api/v1/pallets/:purchase_order_id
//@desc     Get all pallets and their products by purchase order ID
//@access   Private
exports.getPalletsByPurchaseOrder = asyncHandler(async (req, res) => {
  const { purchase_order_id } = req.params;

  // Obtener el purchase order asociado al purchase_order_id
  const purchaseOrder = await PurchaseOrder.findByPk(purchase_order_id);

  if (!purchaseOrder) {
    return res.status(404).json({ msg: "Purchase order not found" });
  }

  // Obtener todos los pallets relacionados con el purchase_order_id
  const pallets = await Pallet.findAll({
    where: { purchase_order_id },
    include: [
      {
        model: PalletProduct,
        attributes: ['id', 'purchaseorderproduct_id', 'quantity', 'available_quantity'],
        where: { available_quantity: { [Op.gt]: 0 } },
        include: [
          {
            model: PurchaseOrderProduct,
            attributes: ['id', 'product_id'],
            include: [
              {
                model: Product,
                attributes: ['id', 'ASIN', 'seller_sku', 'product_image', 'product_name', 'in_seller_account'],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!pallets || pallets.length === 0) {
    return res.status(404).json({ msg: "No pallets found for the given purchase order ID" });
  }

  // Formatear la respuesta para que sea más clara
  const formattedPallets = pallets.map((pallet) => {
    return {
      purchase_order_number: purchaseOrder.order_number,
      pallet_number: pallet.pallet_number,
      pallet_id: pallet.id,
      purchase_order_id: pallet.purchase_order_id,
      products: pallet.PalletProducts.map((palletProduct) => {
        const productData = palletProduct.PurchaseOrderProduct?.Product || {};
        return {
          pallet_product_id: palletProduct.id,
          quantity: palletProduct.quantity,
          product_id: productData.id,
          ASIN: productData.ASIN,
          seller_sku: productData.seller_sku,
          product_image: productData.product_image,
          product_name: productData.product_name,
          in_seller_account: productData.in_seller_account,
          available_quantity: palletProduct.available_quantity,
          pallet_number: pallet.pallet_number
        };
      }),
    };
  });

  return res.status(200).json({
    order_number: purchaseOrder.order_number,
    purchase_order_id: parseInt(purchase_order_id),
    pallets: formattedPallets,
  });
});

//@route    GET api/v1/purchaseorders/with-pallets
//@desc     Get all purchase orders associated with pallets
//@access   Private
exports.getPurchaseOrdersWithPallets = asyncHandler(async (req, res) => {

  // Obtener los purchase_order_id únicos de la tabla de Pallets
  const purchaseOrderIds = await Pallet.findAll({
    attributes: ['purchase_order_id'], // Solo el campo `purchase_order_id`
    group: ['purchase_order_id'], // Agrupar por `purchase_order_id`
  });

  // Si no se encontraron purchase_order_id
  if (!purchaseOrderIds || purchaseOrderIds.length === 0) {
    return res.status(404).json({ msg: "No purchase orders associated with pallets found" });
  }

  // Extraer los IDs en un array
  const ids = purchaseOrderIds.map((pallet) => pallet.purchase_order_id);

  // Obtener los detalles completos de los PurchaseOrders utilizando los IDs
  const purchaseOrders = await PurchaseOrder.findAll({
    where: { id: ids },
  });

  return res.status(200).json(purchaseOrders);
});

//@route   GET api/v1/shipments/tracking
//@desc    Track shipments from amazon
//@access  Private
exports.getShipmentTracking = asyncHandler(async (req, res) => {
  console.log('Tracking shipments...');
  const baseUrl = `https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments`;

  const marketPlace = process.env.MARKETPLACE_US_ID;
  const lastUpdatedAfter = getLastMonthDate();
  const shipmentStatuses = SHIPMENT_STATUSES.join(',');
  let accessToken = await fetchNewTokenForFees();
  console.log(accessToken);
  logger.info('Access token:', accessToken);

  try {

    if (!accessToken) {
      console.log('fetching new token for sync db with amazon...');
      logger.info('fetching new token for sync db with amazon...');
      accessToken = await fetchNewTokenForFees();
    } else {
      console.log('Token is still valid...');
      logger.info('Token is still valid...');
    }

    let url = `${baseUrl}?MarketPlaceId=${marketPlace}&LastUpdatedAfter=${lastUpdatedAfter}&ShipmentStatusList=${shipmentStatuses}`;

    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken,
      },
    });

    const amazonShipments = response.data.payload.ShipmentData;

    for (const amazonShipment of amazonShipments) {
      const { ShipmentId, ShipmentName, ShipmentStatus } = amazonShipment;

      const shipment = await OutgoingShipment.findOne({
        where: { shipment_number: ShipmentName },
      });

      if (shipment) {
        await updateShipmentId(shipment, ShipmentId);
        await updateShipmentStatus(shipment, ShipmentStatus);
      } else {
        console.warn(`Shipment no encontrado: ${ShipmentName}`);
      }
    }

    return res.status(200).json({ msg: "Shipments tracked and updated successfully." });
  } catch (error) {
    console.error("Error fetching shipment data:", error.response?.data || error.message);
    return res.status(500).json({ error: "Failed to fetch shipments", details: error.message });
  }
});

const updateShipmentId = async (shipment, shipmentId) => {
  try {
    if (shipment.fba_shipment_id !== shipmentId) {
      shipment.fba_shipment_id = shipmentId;
      await shipment.save();
      console.log(`FBA Shipment ID actualizado para shipment_number: ${shipment.shipment_number}`);
    }
  } catch (error) {
    console.error(
      `Error actualizando fba_shipment_id para shipment_number: ${shipment.shipment_number}`,
      error.message
    );
  }
};

const updateShipmentStatus = async (shipment, shipmentStatus) => {
  try {
    if (shipment.status !== shipmentStatus) {
      const previousStatus = shipment.status;
      shipment.status = shipmentStatus;
      await shipment.save();
      console.log(
        `Shipment status actualizado para shipment_number: ${shipment.shipment_number}`
      );

      if (shipmentStatus === "IN_TRANSIT" && previousStatus !== "IN_TRANSIT") {
        await updateWarehouseStockForShipment(shipment);
      }
    }
  } catch (error) {
    console.error(
      `Error actualizando status para shipment_number: ${shipment.shipment_number}`,
      error.message
    );
  }
};

const getLastMonthDate = () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  return lastMonth.toISOString();
};

const SHIPMENT_STATUSES = [
  "IN_TRANSIT",
  "DELIVERED"
];

const updateWarehouseStockForShipment = async (shipment) => {
  try {
    const shipmentProducts = await OutgoingShipmentProduct.findAll({
      where: { outgoing_shipment_id: shipment.id },
      include: [
        {
          model: PurchaseOrderProduct,
          as: 'purchaseOrderProduct',
          include: [
            {
              model: Product,
              as: 'product',
            },
          ],
        },
      ],
    });

    for (let shipmentProduct of shipmentProducts) {
      const purchaseOrderProduct = shipmentProduct.purchaseOrderProduct;
      const product = purchaseOrderProduct?.product;

      if (!product) {
        console.warn(
          `Producto no encontrado para shipment_product_id: ${shipmentProduct.id}`
        );
        continue;
      }
      if (product.warehouse_stock < shipmentProduct.quantity) {
        console.warn(
          `Stock insuficiente para el producto ${product.id}. Stock actual: ${product.warehouse_stock}, requerido: ${shipmentProduct.quantity}`
        );
        continue;
      }

      const newWarehouseStock = product.warehouse_stock - shipmentProduct.quantity;

      await product.update({
        warehouse_stock: newWarehouseStock,
      });

      console.log(
        `Stock actualizado para producto ${product.id}. Nuevo stock: ${newWarehouseStock}`
      );
    }
  } catch (error) {
    console.error(
      `Error actualizando warehouse_stock para shipment_number: ${shipment.shipment_number}`,
      error.message
    );
  }
};

const revertWarehouseStockForShipment = async (shipment) => {
  try {
    const shipmentProducts = await OutgoingShipmentProduct.findAll({
      where: { outgoing_shipment_id: shipment.id },
      include: [
        {
          model: PurchaseOrderProduct,
          as: 'purchaseOrderProduct',
          include: [
            {
              model: Product,
              as: 'product',
            },
          ],
        },
      ],
    });

    for (let shipmentProduct of shipmentProducts) {
      const purchaseOrderProduct = shipmentProduct.purchaseOrderProduct;
      const product = purchaseOrderProduct?.product;

      if (!product) {
        console.warn(
          `Producto no encontrado para shipment_product_id: ${shipmentProduct.id}`
        );
        continue;
      }

      const restoredStock = product.warehouse_stock + shipmentProduct.quantity;

      await product.update({
        warehouse_stock: restoredStock,
      });

      console.log(
        `Stock restaurado para producto ${product.id}. Nuevo stock: ${restoredStock}`
      );
    }
  } catch (error) {
    console.error(
      `Error restaurando warehouse_stock para shipment_number: ${shipment.shipment_number}`,
      error.message
    );
  }
};
