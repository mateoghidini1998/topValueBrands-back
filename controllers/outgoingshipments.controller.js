const {
  OutgoingShipment,
  PalletProduct,
  OutgoingShipmentProduct,
  PurchaseOrderProduct,
  Product,
  Pallet,
  PurchaseOrder,
  WarehouseLocation,
  AmazonProductDetail,
} = require("../models");
const asyncHandler = require("../middlewares/async");
const { sequelize } = require("../models");
const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const { where, Op } = require("sequelize");
const req = require("express/lib/request");
const axios = require("axios");
const { fetchNewTokenForFees } = require("../middlewares/lwa_token");
const logger = require("../logger/logger");
const {
  recalculateWarehouseStock,
} = require("../utils/warehouse_stock_calculator");

//@route    POST api/v1/shipments
//@desc     Create an outgoing shipment
//@access   Private
exports.createShipment = asyncHandler(async (req, res) => {
  const existingShipment = await OutgoingShipment.findOne({
    where: { shipment_number: req.body.shipment_number },
  });

  if (existingShipment) {
    console.warn(
      `Shipment already exists with shipment_number: ${req.body.shipment_number}`
    );
    return res.status(400).json({ msg: "Shipment already exists" });
  }

  const palletProducts = req.body.palletproducts;

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
  const newShipment = await OutgoingShipment.create({
    shipment_number: req.body.shipment_number,
    status: "WORKING",
  });

  const affectedProducts = new Set();

  for (let item of palletProducts) {
    const palletProduct = await PalletProduct.findOne({
      where: { id: item.pallet_product_id },
    });

    const newAvailableQuantity =
      palletProduct.available_quantity - item.quantity;

    await palletProduct.update({
      available_quantity: newAvailableQuantity,
    });

    await OutgoingShipmentProduct.create({
      outgoing_shipment_id: newShipment.id,
      pallet_product_id: item.pallet_product_id,
      quantity: item.quantity,
    });

    const purchaseOrderProduct = await PurchaseOrderProduct.findByPk(
      palletProduct.purchaseorderproduct_id
    );

    if (!purchaseOrderProduct) {
      console.warn(
        `No PurchaseOrderProduct found for pallet_product_id: ${item.pallet_product_id}`
      );
    } else {
      affectedProducts.add(purchaseOrderProduct.product_id);
    }
  }

  console.log(`Recalculating warehouse stock for affected products:`, [
    ...affectedProducts,
  ]);
  for (const productId of affectedProducts) {
    console.log(`Recalculating warehouse stock for product_id: ${productId}`);
    await recalculateWarehouseStock(productId);
  }

  console.log(
    `Fetching shipment with products for shipment_id: ${newShipment.id}`
  );
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

  console.log(`Shipment created successfully:`, shipmentWithProducts);

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
    attributes: [
      "id",
      "purchaseorderproduct_id",
      "pallet_id",
      "quantity",
      "available_quantity",
    ],
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
    status: "WORKING",
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
  const {
    page = 1,
    limit = 50,
    keyword = "",
    status = "",
    orderBy = "createdAt",
    orderWay = "DESC",
  } = req.query;

  const offset = (page - 1) * limit;
  const whereClause = {};

  const validOrderFields = [
    "shipment_number",
    "status",
    "createdAt",
    "updatedAt",
  ];
  const validOrderBy = validOrderFields.includes(orderBy)
    ? orderBy
    : "createdAt";
  const validOrderWay = ["ASC", "DESC"].includes(orderWay.toUpperCase())
    ? orderWay.toUpperCase()
    : "DESC";

  if (keyword) {
    whereClause[Op.or] = [
      { shipment_number: { [Op.like]: `%${keyword}%` } },
      { status: { [Op.like]: `%${keyword}%` } },
    ];
  }

  if (status) {
    whereClause.status = status;
  }

  const shipments = await OutgoingShipment.findAndCountAll({
    where: whereClause,
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
    distinct: true, // -> elimina los duplicados
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [[validOrderBy, validOrderWay]],
  });

  return res.status(200).json({
    total: shipments.count,
    pages: Math.ceil(shipments.count / limit),
    currentPage: parseInt(page),
    shipments: shipments.rows,
  });
});

//@route    GET api/v1/shipment/:id
//@desc     Get outgoing shipment by id
//@access   Private

exports.getShipment = asyncHandler(async (req, res) => {
  const shipment = await OutgoingShipment.findOne({
    where: { id: req.params.id },
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
        through: {
          attributes: ["quantity", "id", "is_checked"],
        },
        include: [
          {
            model: PurchaseOrderProduct,
            as: "purchaseOrderProduct",
            attributes: ["id", "product_id"],
            include: [
              {
                model: Product,
                attributes: [
                  "id",
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
                    attributes: ["ASIN", "seller_sku"],
                  },
                ],
              },
            ],
          },
          {
            model: Pallet,
            attributes: ["id", "pallet_number"],
            include: [
              {
                model: WarehouseLocation,
                as: "warehouseLocation",
                attributes: ["id", "location"],
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

  const shipmentData = shipment.toJSON();

  const formattedShipment = {
    ...shipmentData,
    PalletProducts: shipmentData.PalletProducts.map((palletProduct) => {
      const product = palletProduct.purchaseOrderProduct?.Product;
      const amazonDetail = product?.AmazonProductDetail;

      return {
        ...palletProduct,
        warehouse_location:
          palletProduct.Pallet?.warehouseLocation?.location || null,
        pallet_number: palletProduct.Pallet?.pallet_number || null,
        product_name: product?.product_name || null,
        product_image: product?.product_image || null,
        seller_sku: amazonDetail?.seller_sku || null,
        upc: product?.upc || null,
        pack_type: parseInt(product?.pack_type) || 1,
        ASIN: amazonDetail?.ASIN || null,
        in_seller_account: product?.in_seller_account || null,
        purchaseOrderProduct: undefined,
      };
    }),
  };

  const uniquePallets = [];

  formattedShipment.PalletProducts.forEach((item) => {
    if (!uniquePallets.some((p) => p.pallet_id === item.pallet_id)) {
      uniquePallets.push({
        pallet_id: item.pallet_id,
        pallet_number: item.pallet_number,
        warehouse_location: item.warehouse_location,
      });
    }
  });

  for (const pallet of uniquePallets) {
    const resultArray = await sequelize.query(
      `SELECT are_all_pallet_products_in_shipment(:pallet_id, :shipment_id) AS allInShipment`,
      {
        replacements: {
          pallet_id: pallet.pallet_id,
          shipment_id: shipment.id,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // resultado final
    const result = resultArray[0];
    pallet.allProductsInShipment = Boolean(result.allInShipment);

    // 🔥 NUEVO: Verificamos si todos los productos están "checked"
    const allCheckedResult = await sequelize.query(
      `
      SELECT 
        COUNT(*) = SUM(CASE WHEN osp.is_checked = true THEN 1 ELSE 0 END) AS allChecked
      FROM outgoingshipmentproducts osp
      INNER JOIN palletproducts pp ON osp.pallet_product_id = pp.id
      WHERE osp.outgoing_shipment_id = :shipment_id
        AND pp.pallet_id = :pallet_id
    `,
      {
        replacements: {
          shipment_id: shipment.id,
          pallet_id: pallet.pallet_id,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    pallet.allProductsChecked = Boolean(allCheckedResult[0].allChecked);
  }

  formattedShipment.pallets = uniquePallets;

  return res.status(200).json(formattedShipment);
});

//@route    GET api/v1/shipment/:shipment_number
//@desc     Get outgoing shipment by shipment number
//@access   Private
exports.getShipmentByNumber = asyncHandler(async (req, res) => {
  // if (req.user.role !== "admin") {
  //   return res.status(401).json({ msg: "Unauthorized" });
  // }

  const shipment = await OutgoingShipment.findOne({
    where: { shipment_number: req.params.shipment_number },
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
        include: [
          {
            model: PurchaseOrderProduct,
            attributes: ["id", "product_id"],
            include: [
              {
                model: Product,
                attributes: [
                  "id",
                  "product_name",
                  "product_image",
                  "in_seller_account",
                ],
                include: [
                  {
                    model: AmazonProductDetail,
                    as: "AmazonProductDetail",
                    attributes: ["ASIN", "seller_sku"],
                  },
                ],
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

  const shipmentData = shipment.toJSON();

  const formattedShipment = {
    ...shipmentData,
    PalletProducts: shipmentData.PalletProducts.map((palletProduct) => {
      const productName =
        palletProduct.PurchaseOrderProduct?.Product?.product_name || null;

      const productImage =
        palletProduct.PurchaseOrderProduct?.Product?.product_image || null;
      const in_seller_account =
        palletProduct.PurchaseOrderProduct?.Product?.in_seller_account || null;

      const detail = product.AmazonProductDetail || {};

      return {
        ...palletProduct,
        product_name: product.product_name || null,
        product_image: product.product_image || null,
        seller_sku: detail.seller_sku || null,
        in_seller_account: product.in_seller_account || null,
        PurchaseOrderProduct: undefined,
      };
    }),
  };

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
      transaction,
    });

    if (!shipment) {
      await transaction.rollback();
      return res.status(404).json({ msg: "Shipment not found" });
    }

    for (const palletProduct of shipment.PalletProducts) {
      if (!palletProduct.OutgoingShipmentProduct) {
        console.error(
          `Missing OutgoingShipmentProduct for PalletProduct ID: ${palletProduct.id}`
        );
        await transaction.rollback();
        return res.status(400).json({
          msg: "Invalid shipment data: missing OutgoingShipmentProduct",
        });
      }
      const palletProductId = palletProduct.id;
      const { quantity } = palletProduct.OutgoingShipmentProduct;

      // Incrementar available_quantity en PalletProduct
      await PalletProduct.increment(
        { available_quantity: quantity },
        { where: { id: palletProductId }, transaction }
      );

      await recalculateWarehouseStock(palletProduct.purchaseorderproduct_id);
    }

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
    include: [
      {
        model: PalletProduct,
        through: { attributes: ["quantity"] },
      },
    ],
  });

  if (!shipment) {
    return res.status(404).json({ msg: "Shipment not found" });
  }

  const transaction = await sequelize.transaction();

  try {
    const updatedPalletProducts = req.body.palletProducts;

    for (let product of shipment.PalletProducts) {
      const palleProduct = await PalletProduct.findOne({
        where: { id: product.id },
      });

      const updatedProduct = updatedPurchaseOrderProducts.find(
        (item) => item.purchase_order_product_id === product.id
      );

      if (updatedProduct) {
        const oldQuantity = product.OutgoingShipmentProduct.quantity;
        const newQuantity = updatedProduct.quantity;

        console.log("OLD QUANTITY: ", oldQuantity);
        console.log("NEW QUANTITY: ", newQuantity);

        let currentAvailableQuantity = purchaseOrderProduct.quantity_available;
        console.log("CURRENT AV QTY: ", currentAvailableQuantity);

        if (newQuantity > currentAvailableQuantity) {
          throw new Error(
            `Quantity of ${newQuantity} exceeds the available stock for product ID ${product.id}. Available stock: ${currentAvailableQuantity}`
          );
        }

        let finalAvailableQuantity;
        if (newQuantity > oldQuantity) {
          finalAvailableQuantity =
            currentAvailableQuantity - (newQuantity - oldQuantity);
        } else if (newQuantity < oldQuantity) {
          finalAvailableQuantity =
            currentAvailableQuantity + (oldQuantity - newQuantity);
        } else {
          finalAvailableQuantity = currentAvailableQuantity;
        }

        console.log("FINAL AV QTY: ", finalAvailableQuantity);

        await purchaseOrderProduct.update(
          { quantity_available: finalAvailableQuantity },
          { transaction }
        );

        await OutgoingShipmentProduct.update(
          { quantity: newQuantity },
          {
            where: {
              outgoing_shipment_id: shipment.id,
              purchase_order_product_id: product.id,
            },
            transaction,
          }
        );
      }
    }

    if (req.body.shipment_number) {
      shipment.shipment_number = req.body.shipment_number;
      await shipment.save({ transaction });
    }

    await transaction.commit();

    const updatedShipment = await OutgoingShipment.findOne({
      where: { id: shipment.id },
      include: [
        {
          model: PurchaseOrderProduct,
          through: { attributes: ["quantity"] },
        },
      ],
    });

    return res.status(200).json({
      msg: "Shipment updated successfully",
      shipment: updatedShipment,
    });
  } catch (error) {
    await transaction.rollback();
    return res
      .status(500)
      .json({ msg: "Something went wrong", error: error.message });
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
          "id",
          "purchaseorderproduct_id",
          "available_quantity",
          "quantity",
        ],
        include: [
          {
            model: PurchaseOrderProduct,
            as: "purchaseOrderProduct",
            attributes: ["product_id", "expire_date"],
            include: [
              {
                model: Product,
                attributes: [],
                include: [
                  {
                    model: AmazonProductDetail,
                    as: "AmazonProductDetail",
                    attributes: ["seller_sku"],
                  },
                ],
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
    "..",
    "templates",
    "2DWorkflow_Create_Shipment_Template.xlsx"
  );

  if (!fs.existsSync(templatePath)) {
    return res.status(500).json({ msg: "Template not found" });
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
      product.purchaseOrderProduct?.Product?.AmazonProductDetail?.seller_sku ||
      "N/A";
    const quantity = product.OutgoingShipmentProduct?.quantity || 0;

    // MM/DD/YYYY
    const expireDate = product.purchaseOrderProduct?.expire_date
      ? (() => {
        const date = new Date(product.purchaseOrderProduct.expire_date);
        const month = String(date.getMonth() + 1).padStart(2, "0"); // Mes (0-based)
        const day = String(date.getDate()).padStart(2, "0");
        const year = date.getFullYear();
        return `${month}-${day}-${year}`;
      })()
      : "N/A";

    if (aggregatedProducts[sellerSku]) {
      aggregatedProducts[sellerSku].quantity += quantity;
    } else {
      aggregatedProducts[sellerSku] = {
        sellerSku,
        quantity,
        unitsPerCase: 1, // Valor constante para UNITS_PER_CASE
        expireDate: expireDate,
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
    row.getCell(6).value = product.expireDate;
    row.commit();
    rowIndex++;
  });

  // Generar un nombre único para el archivo
  const fileName = `2DWorkflow_Shipment_${shipment.shipment_number}.xlsx`;
  const savePath = path.join(__dirname, "..", "exports", fileName);

  // Guardar el archivo en el servidor
  await workbook.xlsx.writeFile(savePath);

  // Descargar el archivo al cliente
  res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  await workbook.xlsx.write(res); // Escribir directamente al cliente
  res.end();
});

//@route    GET api/v1/pallets/:purchase_order_id
//@desc     Get all pallets and their products by purchase order ID
//@access   Private
exports.getPalletsByPurchaseOrder = asyncHandler(async (req, res) => {
  const { purchase_order_id } = req.params;

  // Buscar el Purchase Order
  const purchaseOrder = await PurchaseOrder.findByPk(purchase_order_id);

  if (!purchaseOrder) {
    return res.status(404).json({ msg: "Purchase order not found" });
  }

  // Buscar los pallets con productos relacionados
  const pallets = await Pallet.findAll({
    where: { purchase_order_id },
    include: [
      {
        model: PalletProduct,
        attributes: [
          "id",
          "purchaseorderproduct_id",
          "quantity",
          "available_quantity",
        ],
        where: { available_quantity: { [Op.gt]: 0 } },
        include: [
          {
            model: PurchaseOrderProduct,
            as: "purchaseOrderProduct",
            attributes: ["id", "product_id"],
            include: [
              {
                model: Product,
                attributes: [
                  "id",
                  "product_image",
                  "product_name",
                  "in_seller_account",
                  "upc",
                ],
                include: [
                  {
                    model: AmazonProductDetail,
                    as: "AmazonProductDetail",
                    attributes: ["ASIN", "seller_sku"],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!pallets || pallets.length === 0) {
    return res
      .status(404)
      .json({ msg: "No pallets found for the given purchase order ID" });
  }

  // Formatear la respuesta
  const formattedPallets = pallets.map((pallet) => {
    return {
      purchase_order_number: purchaseOrder.order_number,
      pallet_number: pallet.pallet_number,
      pallet_id: pallet.id,
      purchase_order_id: pallet.purchase_order_id,
      products: pallet.PalletProducts.map((palletProduct) => {
        const productData = palletProduct.purchaseOrderProduct.Product || {};
        const detail = productData.AmazonProductDetail || {};

        return {
          pallet_product_id: palletProduct.id,
          quantity: palletProduct.quantity,
          product_id: productData.id,
          ASIN: detail.ASIN || null,
          upc: productData.upc || null,
          seller_sku: detail.seller_sku || null,
          product_image: productData.product_image || null,
          product_name: productData.product_name || null,
          in_seller_account: productData.in_seller_account || null,
          available_quantity: palletProduct.available_quantity,
          pallet_number: pallet.pallet_number,
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
    attributes: ["purchase_order_id"], // Solo el campo `purchase_order_id`
    group: ["purchase_order_id"], // Agrupar por `purchase_order_id`
  });

  // Si no se encontraron purchase_order_id
  if (!purchaseOrderIds || purchaseOrderIds.length === 0) {
    return res
      .status(404)
      .json({ msg: "No purchase orders associated with pallets found" });
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
  const baseUrl = `https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments`;
  const marketPlace = process.env.MARKETPLACE_US_ID;
  const lastUpdatedAfter = getLastMonthDate();
  const accessToken = req.headers["x-amz-access-token"];

  if (!accessToken) {
    return res.status(400).json({ error: "Access token is missing" });
  }

  try {
    // Ejecutamos todas las requests en paralelo
    const shipmentRequests = SHIPMENT_STATUSES.map(async (status) => {
      console.log(status);
      try {
        const url = `${baseUrl}?MarketPlaceId=${marketPlace}&LastUpdatedAfter=${lastUpdatedAfter}&ShipmentStatusList=${status}`;
        const response = await axios.get(url, {
          headers: {
            "Content-Type": "application/json",
            "x-amz-access-token": accessToken,
          },
        });

        const amazonShipments = response.data.payload?.ShipmentData || [];
        console.log(
          `Fetched ${amazonShipments.length} shipments for status: ${status}`
        );

        // Procesamos los envíos en paralelo para mejorar el rendimiento
        await Promise.all(
          amazonShipments.map(async (amazonShipment) => {
            const { ShipmentId, ShipmentName, ShipmentStatus } = amazonShipment;

            const shipment = await OutgoingShipment.findOne({
              where: { shipment_number: ShipmentName },
            });

            if (shipment) {
              await updateShipmentId(shipment, ShipmentId);
              await updateShipmentStatus(shipment, ShipmentStatus);
            }
          })
        );
      } catch (error) {
        console.error(
          `Error fetching shipments for status ${status}:`,
          error.response?.data || error.message
        );
      }
    });

    // Esperamos a que todas las solicitudes se completen
    await Promise.all(shipmentRequests);

    return res
      .status(200)
      .json({ msg: "Shipments tracked and updated successfully." });
  } catch (error) {
    logger.error("Error in getShipmentTracking:", error);
    return res.status(500).json({
      error: "Failed to fetch shipments",
      details: error.message,
    });
  }
});

exports.addReferenceId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { referenceId } = req.body;
  const shipment = await OutgoingShipment.findOne({
    where: { id },
  });
  if (!shipment) {
    return res.status(404).json({ msg: "Shipment not found" });
  }
  shipment.reference_id = referenceId;
  await shipment.save();
  return res.status(200).json({ msg: "Reference ID added successfully" });
});

exports.addFbaShipmentId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fbaShipmentId } = req.body;
  const shipment = await OutgoingShipment.findOne({
    where: { id },
  });
  if (!shipment) {
    return res.status(404).json({ msg: "Shipment not found" });
  }
  shipment.fba_shipment_id = fbaShipmentId;
  await shipment.save();
  return res.status(200).json({ msg: "Reference ID added successfully" });
})

exports.updateFbaShipmentStatusToShipped = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const shipment = await OutgoingShipment.findOne({
    where: { id },
  });
  if (!shipment) {
    return res.status(404).json({ msg: "Shipment not found" });
  }
  const shipmentProducts = await sequelize.query(
    `
      SELECT osp.*, 
      pp.*, 
      pop.product_id
      FROM outgoingshipmentproducts osp
      LEFT JOIN palletproducts pp ON osp.pallet_product_id = pp.id
      LEFT JOIN purchaseorderproducts pop ON pp.purchaseorderproduct_id = pop.id
      WHERE osp.outgoing_shipment_id = :shipmentId
    `,
    {
      type: sequelize.QueryTypes.SELECT,
      replacements: { shipmentId: shipment.id },
    }
  );
  shipment.status = 'SHIPPED';
  await shipment.save();

  const productIds = shipmentProducts.map(sp => sp.product_id).filter(id => id);

  for (const productId of productIds) {
    console.log(`we are talking about our product with id: ${productId}`);
    await recalculateWarehouseStock(productId);
  }
  return res.status(200).json({ msg: "Shipment status updated and warehouse stock recalculated successfully" });
})



exports.toggleProductChecked = asyncHandler(async (req, res) => {
  const { outgoingShipmentProductId } = req.params;

  const outgoingShipmentProduct = await OutgoingShipmentProduct.findByPk(
    outgoingShipmentProductId
  );

  if (!outgoingShipmentProduct) {
    return res
      .status(404)
      .json({ message: "OutgoingShipmentProduct no encontrado" });
  }

  outgoingShipmentProduct.is_checked = !outgoingShipmentProduct.is_checked;
  await outgoingShipmentProduct.save();

  if (!outgoingShipmentProduct.pallet_product_id) {
    return res.status(500).json({
      message:
        "Error: pallet_product_id es undefined en OutgoingShipmentProduct",
    });
  }

  const palletProduct = await PalletProduct.findByPk(
    outgoingShipmentProduct.pallet_product_id
  );

  if (!palletProduct) {
    return res.status(404).json({ message: "PalletProduct no encontrado" });
  }

  const remainingUnchecked = await OutgoingShipmentProduct.count({
    where: {
      pallet_product_id: palletProduct.id,
      is_checked: false,
    },
  });

  const prevActivePalletProducts = await PalletProduct.count({
    where: {
      pallet_id: palletProduct.pallet_id,
      is_active: true,
    },
  });

  if (remainingUnchecked === 0) {
    palletProduct.is_active = false;
    await palletProduct.save();
  } else {
    palletProduct.is_active = true;
    await palletProduct.save();
  }

  const activePalletProducts = await PalletProduct.count({
    where: {
      pallet_id: palletProduct.pallet_id,
      is_active: true,
    },
  });

  const pallet = await Pallet.findByPk(palletProduct.pallet_id);
  let warehouse_location = await WarehouseLocation.findByPk(
    pallet.warehouse_location_id
  );

  if (activePalletProducts === 0) {
    if (pallet) {
      pallet.is_active = false;
      await pallet.save();
      const pallets_quantity = await recalculateWarehouseLocation(
        warehouse_location.id
      );
      const new_current_capacity =
        warehouse_location.capacity - pallets_quantity;
      await warehouse_location.update({
        current_capacity: new_current_capacity,
      });
    }
  } else if (activePalletProducts > 0 && prevActivePalletProducts === 0) {
    const pallet = await Pallet.findByPk(palletProduct.pallet_id);
    if (pallet) {
      if (warehouse_location.current_capacity === 0) {
        warehouse_location = await WarehouseLocation.findOne({
          where: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("location")),
            "floor"
          ),
        });
        await pallet.update({
          warehouse_location_id: warehouse_location.id,
          is_active: true,
        });

        const pallets_quantity = await recalculateWarehouseLocation(
          warehouse_location.id
        );
        const new_current_capacity =
          warehouse_location.capacity - pallets_quantity;
        await warehouse_location.update({
          current_capacity: new_current_capacity,
        });
      } else {
        await pallet.update({
          warehouse_location_id: warehouse_location.id,
          is_active: true,
        });
        const pallets_quantity = await recalculateWarehouseLocation(
          warehouse_location.id
        );
        const new_current_capacity =
          warehouse_location.capacity - pallets_quantity;
        await warehouse_location.update({
          current_capacity: new_current_capacity,
        });
      }
    }
  } else {
    await pallet.update({
      warehouse_location_id: warehouse_location.id,
      is_active: true,
    });
    const pallets_quantity = await recalculateWarehouseLocation(
      warehouse_location.id
    );
    const new_current_capacity = warehouse_location.capacity - pallets_quantity;
    await warehouse_location.update({
      current_capacity: new_current_capacity,
    });
  }

  return res.json({
    message: "Estado actualizado correctamente",
    is_checked: outgoingShipmentProduct.is_checked,
  });
});

exports.checkAllShipmentProductsOfAPallet = asyncHandler(async (req, res) => {
  const { shipmentId, palletId } = req.params;

  if (!shipmentId || !palletId) {
    return res
      .status(400)
      .json({ message: "shipmentId y palletId son requeridos." });
  }

  // Obtener todos los palletProduct IDs del pallet
  const palletProducts = await PalletProduct.findAll({
    where: { pallet_id: palletId },
    attributes: ["id"],
  });

  const palletProductIds = palletProducts.map((pp) => pp.id);

  if (palletProductIds.length === 0) {
    return res
      .status(404)
      .json({ message: "No se encontraron productos en el pallet." });
  }

  // Verificamos si todos ya están marcados como is_checked = true
  const { count: totalCount, rows: shipmentProducts } =
    await OutgoingShipmentProduct.findAndCountAll({
      where: {
        outgoing_shipment_id: shipmentId,
        pallet_product_id: palletProductIds,
      },
      attributes: ["id", "is_checked"],
    });

  const allChecked = shipmentProducts.every((sp) => sp.is_checked === true);

  // Si todos están marcados, los desmarcamos. Si no, los marcamos todos.
  const newValue = allChecked ? false : true;

  const [updatedCount] = await OutgoingShipmentProduct.update(
    { is_checked: newValue },
    {
      where: {
        outgoing_shipment_id: shipmentId,
        pallet_product_id: palletProductIds,
      },
    }
  );

  await Promise.all(
    palletProductIds.map((palletProductId) =>
      updatePalletStatus(palletProductId)
    )
  );

  return res.status(200).json({
    message: `Productos ${newValue ? "marcados" : "desmarcados"} correctamente`,
    updatedCount,
  });
});

async function updatePalletStatus(palletProductId) {
  const palletProduct = await PalletProduct.findByPk(palletProductId);
  if (!palletProduct) return;

  const remainingUnchecked = await OutgoingShipmentProduct.count({
    where: {
      pallet_product_id: palletProduct.id,
      is_checked: false,
    },
  });

  const prevActivePalletProducts = await PalletProduct.count({
    where: {
      pallet_id: palletProduct.pallet_id,
      is_active: true,
    },
  });

  palletProduct.is_active = remainingUnchecked > 0;
  await palletProduct.save();

  const activePalletProducts = await PalletProduct.count({
    where: {
      pallet_id: palletProduct.pallet_id,
      is_active: true,
    },
  });

  const pallet = await Pallet.findByPk(palletProduct.pallet_id);
  let warehouse_location = await WarehouseLocation.findByPk(
    pallet.warehouse_location_id
  );

  if (activePalletProducts === 0) {
    pallet.is_active = false;
    await pallet.save();

    const pallets_quantity = await recalculateWarehouseLocation(
      warehouse_location.id
    );
    const new_current_capacity = warehouse_location.capacity - pallets_quantity;
    await warehouse_location.update({ current_capacity: new_current_capacity });
  } else if (activePalletProducts > 0 && prevActivePalletProducts === 0) {
    if (warehouse_location.current_capacity === 0) {
      warehouse_location = await WarehouseLocation.findOne({
        where: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("location")),
          "floor"
        ),
      });
    }

    await pallet.update({
      warehouse_location_id: warehouse_location.id,
      is_active: true,
    });

    const pallets_quantity = await recalculateWarehouseLocation(
      warehouse_location.id
    );
    const new_current_capacity = warehouse_location.capacity - pallets_quantity;
    await warehouse_location.update({ current_capacity: new_current_capacity });
  } else {
    await pallet.update({
      warehouse_location_id: warehouse_location.id,
      is_active: true,
    });

    const pallets_quantity = await recalculateWarehouseLocation(
      warehouse_location.id
    );
    const new_current_capacity = warehouse_location.capacity - pallets_quantity;
    await warehouse_location.update({ current_capacity: new_current_capacity });
  }
}

const updateShipmentId = async (shipment, shipmentId) => {
  try {
    if (shipment.fba_shipment_id !== shipmentId) {
      shipment.fba_shipment_id = shipmentId;
      await shipment.save();
    }
  } catch (error) {
    logger.error(
      `Error actualizando fba_shipment_id para shipment_number: ${shipment.shipment_number}`,
      error.message
    );
  }
};

const updateShipmentStatus = async (shipment, shipmentStatus) => {
  try {
    console.log(`we are talking about our shipment with id: ${shipment.id}`);
    console.log(`Shipment number: ${shipment.shipment_number}`);
    console.log(`Current status in database: ${shipment.status}`);
    console.log(`New status from Amazon: ${shipmentStatus}`);
    console.log("Shipment status:", shipment.status);
    console.log("New shipment status:", shipmentStatus);

    if (shipment.status !== shipmentStatus) {
      const shipmentProducts = await sequelize.query(
        `
          SELECT osp.*, 
          pp.*, 
          pop.product_id
          FROM outgoingshipmentproducts osp
          LEFT JOIN palletproducts pp ON osp.pallet_product_id = pp.id
          LEFT JOIN purchaseorderproducts pop ON pp.purchaseorderproduct_id = pop.id
          WHERE osp.outgoing_shipment_id = :shipmentId
        `,
        {
          type: sequelize.QueryTypes.SELECT,
          replacements: { shipmentId: shipment.id },
        }
      );
      shipment.status = shipmentStatus;
      await shipment.save();

      const productIds = shipmentProducts
        .map((sp) => sp.product_id)
        .filter((id) => id);

      for (const productId of productIds) {
        console.log(`we are talking about our product with id: ${productId}`);
        await recalculateWarehouseStock(productId);
      }
    }
  } catch (error) {
    logger.error(
      `Error updating status for shipment_number: ${shipment.shipment_number}`,
      error.message
    );
  }
};

const getLastMonthDate = () => {
  const now = new Date();
  const lastMonth = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    now.getDate()
  );
  return lastMonth.toISOString();
};

const SHIPMENT_STATUSES = [
  "IN_TRANSIT",
  "DELIVERED",
  "WORKING",
  "RECEIVING",
  "SHIPPED",
  "READY_TO_SHIP",
  "CHECKED_IN",
];

const recalculateWarehouseLocation = async (warehouseLocationId) => {
  const pallets = await Pallet.count({
    where: { warehouse_location_id: warehouseLocationId, is_active: true },
  });
  return pallets;
};
