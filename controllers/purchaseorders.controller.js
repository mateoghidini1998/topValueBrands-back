const asyncHandler = require("../middlewares/async");
const {
  Product,
  PurchaseOrder,
  PurchaseOrderProduct,
  Supplier,
  TrackedProduct,
  PurchaseOrderStatus,
} = require("../models");
const { addUPCToPOProduct: addUPC } = require("./products.controller");
const path = require("path");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const { where, Transaction, or, Op } = require("sequelize");
const {
  getTrackedProductsFromAnOrder,
} = require("./trackedproducts.controller");
const {
  recalculateWarehouseStock,
} = require("../utils/warehouse_stock_calculator");

const { sequelize } = require("../models");

exports.createPurchaseOrder = asyncHandler(async (req, res, next) => {
  const {
    order_number,
    supplier_id,
    purchase_order_status_id,
    products,
    notes,
  } = req.body;

  // Check if the order number already exists
  let purchaseOrder = await PurchaseOrder.findOne({ where: { order_number } });

  if (purchaseOrder) {
    return res.status(400).json({ message: "Purchase Order already exists" });
  }

  // Validate all products before creating the PurchaseOrder
  if (products && products.length > 0) {
    for (const product of products) {
      const { product_id } = product;

      const existingProduct = await Product.findByPk(product_id);

      if (!existingProduct) {
        return res
          .status(400)
          .json({ message: `Product ${product_id} not found` });
      }

      // Products must belong to the same supplier
      if (existingProduct.supplier_id !== supplier_id) {
        return res.status(400).json({
          message: `Product ${product_id} does not belong to supplier ${supplier_id}`,
        });
      }
    }
  }

  // Create the PurchaseOrder now that all products are validated
  purchaseOrder = await PurchaseOrder.create({
    order_number,
    supplier_id,
    purchase_order_status_id: 2,
    total_price: 0,
    notes,
  });

  // Create PurchaseOrderProduct entries and calculate the total price
  let totalPrice = 0;
  if (products && products.length > 0) {
    totalPrice = await createPurchaseOrderProducts(purchaseOrder.id, products);
  }

  // Update the PurchaseOrder with the calculated total_price
  await purchaseOrder.update({ total_price: totalPrice });

  // Fetch the updated PurchaseOrder along with the associated PurchaseOrderProducts
  const updatedPurchaseOrder = await PurchaseOrder.findByPk(purchaseOrder.id, {
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProducts",
      },
    ],
  });

  return res.status(201).json({
    success: true,
    data: updatedPurchaseOrder,
  });
});

exports.updatePurchaseOrder = asyncHandler(async (req, res, next) => {
  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id, {
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProducts",
      },
    ],
  });

  if (!purchaseOrder) {
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  const {
    notes,
    purchase_order_status_id,
    products, // Array of updated products
  } = req.body;

  let totalPrice = 0;

  if (notes) purchaseOrder.notes = notes;
  if (purchase_order_status_id) purchaseOrder.purchase_order_status_id = purchase_order_status_id;

  if (products && products.length > 0) {
    const updatedProductIds = products.map((p) => p.product_id);

    const existingProductIds = purchaseOrder.purchaseOrderProducts.map(
      (p) => p.product_id
    );

    const productsToAdd = products.filter(
      (p) => !existingProductIds.includes(p.product_id)
    );
    const productsToRemove = existingProductIds.filter(
      (id) => !updatedProductIds.includes(id)
    );

    for (const productId of productsToRemove) {
      await PurchaseOrderProduct.destroy({
        where: {
          purchase_order_id: purchaseOrder.id,
          product_id: productId,
        },
      });
    }

    for (const product of products) {
      const purchaseOrderProduct = await PurchaseOrderProduct.findOne({
        where: {
          purchase_order_id: purchaseOrder.id,
          product_id: product.product_id,
        },
      });

      if (purchaseOrderProduct) {
        await purchaseOrderProduct.update({
          quantity_purchased: product.quantity,
          product_cost: product.product_cost,
          total_amount: product.quantity * product.product_cost,
        });
      }
    }

    if (productsToAdd.length > 0) {
      await createPurchaseOrderProducts(purchaseOrder.id, productsToAdd);
    }
  }


  await purchaseOrder.save();

  const updatedProducts = await PurchaseOrderProduct.findAll({
    where: { purchase_order_id: purchaseOrder.id },
  });

  totalPrice = updatedProducts.reduce((sum, prod) => sum + parseFloat(prod.quantity_purchased * parseFloat(prod.product_cost)), 0);

  await purchaseOrder.update({ total_price: totalPrice });

  const updatedPurchaseOrder = await PurchaseOrder.findByPk(purchaseOrder.id, {
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProducts",
      },
    ],
  });

  return res.status(200).json({
    success: true,
    data: updatedPurchaseOrder,
  });
});



// Controlador para agregar o actualizar productos en una orden de compra
exports.addOrUpdateProductInPurchaseOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { products } = req.body;

  const transaction = await sequelize.transaction();

  try {
    const purchaseOrder = await PurchaseOrder.findByPk(id, { transaction });

    if (!purchaseOrder) {
      return res.status(404).json({ message: "Purchase Order not found" });
    }

    const supplier_id = purchaseOrder.supplier_id;

    for (const product of products) {
      const { product_id, product_cost, quantity, fees, lowest_fba_price } = product;
      const parsedProductCost = parseFloat(product_cost);

      if (isNaN(parsedProductCost)) {
        throw new Error(`Invalid product cost: ${product_cost}`);
      }

      const supplierProduct = await Product.findByPk(product_id, { transaction });
      if (!supplierProduct || supplierProduct.supplier_id !== supplier_id) {
        return res.status(400).json({
          message: `Product ${product_id} does not belong to supplier ${supplier_id}`,
        });
      }

      const existingProduct = await PurchaseOrderProduct.findOne({
        where: { purchase_order_id: id, product_id, is_active: true },
        transaction,
      });

      if (existingProduct) {
        const updatedFields = {};
        if (existingProduct.product_cost !== parsedProductCost) {
          updatedFields.product_cost = parsedProductCost;
        }
        if (existingProduct.quantity_purchased !== quantity) {
          updatedFields.quantity_purchased = quantity;
        }

        if (Object.keys(updatedFields).length > 0) {
          updatedFields.total_amount = parsedProductCost * quantity;
          updatedFields.unit_price = parsedProductCost;
          updatedFields.profit = lowest_fba_price - fees - parsedProductCost;

          await existingProduct.update(updatedFields, { transaction });
        }
      } else {
        await createPurchaseOrderProducts(purchaseOrder.id, [product], transaction);
      }
    }

    const updatedProducts = await PurchaseOrderProduct.findAll({
      where: { purchase_order_id: id, is_active: true },
      transaction,
    });
    const newTotalPrice = products.reduce((sum, prod) => sum + parseFloat(prod.quantity * parseFloat(prod.product_cost)), 0);

    // Redondear el total_price a un número con dos decimales
    const formattedTotalPrice = parseFloat(newTotalPrice.toFixed(2));

    await purchaseOrder.update({ total_price: formattedTotalPrice }, { transaction });

    await transaction.commit();

    const updatedPurchaseOrder = await PurchaseOrder.findByPk(purchaseOrder.id, {
      include: [
        {
          model: PurchaseOrderProduct,
          as: "purchaseOrderProducts",
        },
      ],
    });

    return res.status(201).json({
      success: true,
      data: updatedPurchaseOrder,
    });
  } catch (error) {
    console.error('Error during transaction:', error);
    await transaction.rollback();
    return next(error);
  }
});

// update incoming order
exports.updateIncomingOrderProducts = asyncHandler(async (req, res, next) => {
  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id);

  if (!purchaseOrder) {
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  const { incomingOrderProductUpdates } = req.body;

  const purchaseorderproducts = await getPurchaseOrderProducts(
    purchaseOrder.id
  );

  for (const purchaseOrderProductUpdate of incomingOrderProductUpdates) {
    const purchaseOrderProduct = purchaseorderproducts.find(
      (p) => p.id === purchaseOrderProductUpdate.purchase_order_product_id
    );

    if (purchaseOrderProduct) {

      // update quantity_available

      purchaseOrderProduct.quantity_available = purchaseOrderProductUpdate.quantity_received - ((purchaseOrderProduct.quantity_received || 0) - (purchaseOrderProduct.quantity_available || 0));

      if (
        purchaseOrderProduct.quantity_received !==
        parseInt(purchaseOrderProductUpdate.quantity_received)
      ) {
        purchaseOrderProduct.quantity_received = parseInt(
          purchaseOrderProductUpdate.quantity_received
        );

        // update quantity_missing

        purchaseOrderProduct.quantity_missing =
          purchaseOrderProduct.quantity_purchased -
          parseInt(
            purchaseOrderProductUpdate.quantity_received
          );


      }

      // update reason_id, expire_date

      if (purchaseOrderProduct.reason_id !== purchaseOrderProductUpdate.reason_id) {
        purchaseOrderProduct.reason_id = purchaseOrderProductUpdate.reason_id;
      }

      if (purchaseOrderProduct.expire_date !== purchaseOrderProductUpdate.expire_date) {
        purchaseOrderProduct.expire_date = purchaseOrderProductUpdate.expire_date;
      }


      const updatedPurchaseOrderProduct = await purchaseOrderProduct.save();

      if (updatedPurchaseOrderProduct) {

        const product = await Product.findByPk(purchaseOrderProduct.product_id);
        if (product) {
          const { upc } = purchaseOrderProductUpdate;
          try {
            await addUPC(product, upc);
          } catch (error) {
            console.error(
              `Error updating UPC for product ${product.id}: ${error.message}`
            );
          }
        }
      }
    } else {
      return res.status(404).json({
        message: `Purchase Order Product not found: ${purchaseOrderProductUpdate.purchaseOrderProductId}`,
      });
    }
  }

  // Verificar si todos los productos tienen quantity_purchased === quantity_received
  const allReceived = purchaseorderproducts.every(
    (p) => p.quantity_purchased === p.quantity_received
  );

  if (allReceived) {
    await PurchaseOrder.update(
      { purchase_order_status_id: PURCHASE_ORDER_STATUSES.CLOSED },
      { where: { id: purchaseOrder.id } }
    );
  }

  res
    .status(200)
    .json({
      message: "Incoming Order Products updated successfully",
      closed: allReceived,
    });
});

exports.updatePurchaseOrderProducts = asyncHandler(async (req, res, next) => {
  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id);

  if (!purchaseOrder) {
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  const { purchaseOrderProductsUpdates } = req.body;

  const purchaseorderproducts = await getPurchaseOrderProducts(
    purchaseOrder.id
  );

  const productsToRecalculate = new Set();

  for (const purchaseOrderProductUpdate of purchaseOrderProductsUpdates) {
    const purchaseOrderProduct = purchaseorderproducts.find(
      (p) => p.id === purchaseOrderProductUpdate.purchaseOrderProductId
    );

    if (purchaseOrderProduct) {
      purchaseOrderProduct.product_cost = parseFloat(
        purchaseOrderProductUpdate.product_cost
      );
      purchaseOrderProduct.quantity_purchased = parseInt(
        purchaseOrderProductUpdate.quantityPurchased
      );
      purchaseOrderProduct.total_amount =
        purchaseOrderProduct.product_cost *
        purchaseOrderProduct.quantity_purchased;

      purchaseOrderProduct.profit = parseFloat(
        purchaseOrderProductUpdate.profit
      );

      if (
        purchaseOrderProduct.quantity_received !==
        parseInt(purchaseOrderProductUpdate.quantityReceived)
      ) {
        purchaseOrderProduct.quantity_received = parseInt(
          purchaseOrderProductUpdate.quantityReceived
        );
        productsToRecalculate.add(purchaseOrderProduct.product_id);
      }

      const updatedPurchaseOrderProduct = await purchaseOrderProduct.save();

      if (updatedPurchaseOrderProduct) {
        const purchaseOrderProducts = await getPurchaseOrderProducts(
          purchaseOrder.id
        );
        const totalPrice = purchaseOrderProducts.reduce((acc, product) => {
          return acc + product.product_cost * product.quantity_purchased;
        }, 0);
        await purchaseOrder.update({ total_price: totalPrice });

        const product = await Product.findByPk(purchaseOrderProduct.product_id);
        if (product) {
          const { upc } = purchaseOrderProductUpdate;
          try {
            await addUPC(product, upc);
          } catch (error) {
            console.error(
              `Error updating UPC for product ${product.id}: ${error.message}`
            );
          }
        }
      }
    } else {
      return res.status(404).json({
        message: `Purchase Order Product not found: ${purchaseOrderProductUpdate.purchaseOrderProductId}`,
      });
    }
  }

  for (const productId of productsToRecalculate) {
    try {
      await recalculateWarehouseStock(productId);
    } catch (error) {
      console.error(
        `Error recalculating warehouse stock for product ${productId}: ${error.message}`
      );
    }
  }

  res
    .status(200)
    .json({ message: "Purchase Order Products updated successfully" });
});

exports.getPurchaseOrderById = asyncHandler(async (req, res, next) => {
  const purchaseOrderId = req.params.id;

  const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, {
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProducts",
        where: { is_active: true },
        include: [
          {
            model: Product,
            as: "Product",
            attributes: ["product_name", "product_image", "in_seller_account"],
          },
        ]
      },
    ],
  });

  return res.status(200).json({
    success: true,
    data: purchaseOrder,
  });
});

//@route    GET api/purchaseorders/
//@desc     Get purchase orders
//@access   Private
exports.getPurchaseOrders = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const keyword = req.query.keyword || '';
  const supplierId = req.query.supplier || null;
  const statusId = req.query.status || null;
  const orderBy = req.query.orderBy || 'updatedAt';
  const orderWay = req.query.orderWay || 'DESC';

  try {
    const whereConditions = {
      is_active: true,

      purchase_order_status_id: parseInt(statusId) || [1, 2, 3, 8],
    };

    if (keyword) {
      whereConditions.order_number = { [Op.like]: `%${keyword}%` };
    }

    if (supplierId) {
      whereConditions.supplier_id = supplierId;
    }

    const { count, rows: purchaseOrders } = await PurchaseOrder.findAndCountAll({
      where: whereConditions,
      order: [[orderBy, orderWay]],
      include: [
        {
          model: PurchaseOrderStatus,
          as: "purchaseOrderStatus",
        },
        {
          model: PurchaseOrderProduct,
          as: "purchaseOrderProducts",
          include: [{ model: Product }],
        },
      ],
      distinct: true, // -> elimina los duplicados
      limit,
      offset,
    });

    await Promise.all(
      purchaseOrders.map(async (purchaseOrder) => {
        const statusDescription = purchaseOrder.purchaseOrderStatus?.description;
        purchaseOrder.setDataValue("status", statusDescription || "Unknown");

        await Promise.all(
          purchaseOrder.purchaseOrderProducts.map(async (purchaseOrderProduct) => {
            const purchaseProduct = purchaseOrderProduct.Product;
            purchaseOrderProduct.setDataValue("product_name", purchaseProduct?.product_name || "Unknown");
            purchaseOrderProduct.setDataValue(
              "quantity_missing",
              purchaseOrderProduct.quantity_purchased - (purchaseOrderProduct.quantity_received || 0)
            );
          })
        );

        const productIds = purchaseOrder.purchaseOrderProducts.map(p => p.product_id);
        const trackedProducts = await TrackedProduct.findAll({
          where: { product_id: productIds },
        });

        const roiArr = trackedProducts.map((trackedProduct) => {
          const product = purchaseOrder.purchaseOrderProducts.find(
            (p) => p.product_id === trackedProduct.product_id
          );
          return product?.product_cost
            ? (trackedProduct.profit / product.product_cost) * 100
            : 0;
        });

        const averageRoi = roiArr.length ? roiArr.reduce((a, b) => a + b, 0) / roiArr.length : 0;
        purchaseOrder.setDataValue("average_roi", averageRoi);

        const supplierName = await Supplier.findByPk(purchaseOrder.supplier_id);
        purchaseOrder.setDataValue('supplier_name', supplierName?.supplier_name || "Unknown");

        const trackedProductDetails = await Promise.all(
          trackedProducts.map(async (trackedProduct) => {
            const product = await Product.findByPk(trackedProduct.product_id);
            const supplier = await Supplier.findByPk(product?.supplier_id);
            return {
              ...trackedProduct.toJSON(),
              product_name: product?.product_name || "Unknown",
              ASIN: product?.ASIN || "Unknown",
              seller_sku: product?.seller_sku || "Unknown",
              supplier_name: supplier?.supplier_name || "Unknown",
              product_image: product?.product_image || "Unknown",
              product_cost: product?.product_cost || 0,
            };
          })
        );
        purchaseOrder.setDataValue("trackedProducts", trackedProductDetails);
      })
    );

    const totalPages = Math.ceil(count / limit);

    console.log(whereConditions)
    console.log(req.query)
    console.log(statusId)
    return res.status(200).json({
      success: true,
      total: count,
      pages: totalPages,
      currentPage: page,
      data: purchaseOrders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Error fetching purchase orders",
      error: error.message,
    });
  }
});

exports.getIncomingShipments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const keyword = req.query.keyword || '';
  const supplierId = req.query.supplier || null;

  try {
    const whereConditions = {
      is_active: true,
      purchase_order_status_id: [4, 5, 6, 7],
    };

    if (keyword) {
      whereConditions.order_number = { [Op.like]: `%${keyword}%` };
    }

    if (supplierId) {
      whereConditions.supplier_id = supplierId;
    }

    const { count, rows: purchaseOrders } = await PurchaseOrder.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: PurchaseOrderStatus,
          as: "purchaseOrderStatus",
        },
        {
          model: PurchaseOrderProduct,
          as: "purchaseOrderProducts",
          include: [{ model: Product }],
        },
      ],
      distinct: true, // -> elimina los duplicados
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    await Promise.all(
      purchaseOrders.map(async (purchaseOrder) => {
        const statusDescription = purchaseOrder.purchaseOrderStatus?.description;
        purchaseOrder.setDataValue("status", statusDescription || "Unknown");

        await Promise.all(
          purchaseOrder.purchaseOrderProducts.map(async (purchaseOrderProduct) => {
            const purchaseProduct = purchaseOrderProduct.Product;
            purchaseOrderProduct.setDataValue("product_name", purchaseProduct?.product_name || "Unknown");
            purchaseOrderProduct.setDataValue(
              "quantity_missing",
              purchaseOrderProduct.quantity_purchased - (purchaseOrderProduct.quantity_received || 0)
            );
          })
        );

        const productIds = purchaseOrder.purchaseOrderProducts.map(p => p.product_id);
        const trackedProducts = await TrackedProduct.findAll({
          where: { product_id: productIds },
        });

        const roiArr = trackedProducts.map((trackedProduct) => {
          const product = purchaseOrder.purchaseOrderProducts.find(
            (p) => p.product_id === trackedProduct.product_id
          );
          return product?.product_cost
            ? (trackedProduct.profit / product.product_cost) * 100
            : 0;
        });

        const averageRoi = roiArr.length ? roiArr.reduce((a, b) => a + b, 0) / roiArr.length : 0;
        purchaseOrder.setDataValue("average_roi", averageRoi);

        const supplierName = await Supplier.findByPk(purchaseOrder.supplier_id);
        purchaseOrder.setDataValue('supplier_name', supplierName?.supplier_name || "Unknown");

        const trackedProductDetails = await Promise.all(
          trackedProducts.map(async (trackedProduct) => {
            const product = await Product.findByPk(trackedProduct.product_id);
            const supplier = await Supplier.findByPk(product?.supplier_id);
            return {
              ...trackedProduct.toJSON(),
              product_name: product?.product_name || "Unknown",
              ASIN: product?.ASIN || "Unknown",
              seller_sku: product?.seller_sku || "Unknown",
              supplier_name: supplier?.supplier_name || "Unknown",
              product_image: product?.product_image || "Unknown",
              product_cost: product?.product_cost || 0,
            };
          })
        );
        purchaseOrder.setDataValue("trackedProducts", trackedProductDetails);
      })
    );

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      success: true,
      total: count,
      pages: totalPages,
      currentPage: page,
      data: purchaseOrders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Error fetching incoming shipments",
      error: error.message,
    });
  }
});


exports.getPurchaseOrderSummaryByID = asyncHandler(async (req, res, next) => {
  const purchaseOrderId = req.params.id;

  // Obtener la orden de compra con productos y estado
  const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, {
    where: { is_active: true },
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProducts",
        where: { is_active: true },
        attributes: ["product_id", "quantity_purchased", "quantity_received", "quantity_missing", "quantity_available", "product_cost", "total_amount", "id", 'reason_id', "expire_date"],
      },
      {
        model: PurchaseOrderStatus,
        as: "purchaseOrderStatus",
        attributes: ["description"],
      },
      {
        model: Supplier,
        as: "suppliers",
        attributes: ["supplier_name"],
      }
    ],
  });

  if (!purchaseOrder) {
    return res.status(404).json({ message: "Purchase order not found" });
  }

  const productIds = purchaseOrder.purchaseOrderProducts.map(p => p.product_id);

  // Obtener productos rastreados con información de producto y proveedor
  const trackedProducts = await TrackedProduct.findAll({
    where: { product_id: { [Op.in]: productIds } },
    include: [
      {
        model: Product,
        as: "product",
        attributes: [
          "product_name",
          "id",
          "ASIN",
          "seller_sku",
          "supplier_id",
          "product_image",
          "product_cost",
          "in_seller_account",
          "supplier_item_number",
          "pack_type",
          "upc",

        ],
        include: [
          {
            model: Supplier,
            as: "supplier",
            attributes: ["supplier_name"]
          }
        ]
      }
    ]
  });

  if (!trackedProducts.length) {
    return res.status(404).json({ message: "Tracked products not found" });
  }

  // Transformar datos y calcular ROI
  const productsData = trackedProducts.map(tp => {
    const product = tp.product;
    const orderProduct = purchaseOrder.purchaseOrderProducts.find(p => p.product_id === tp.product_id);
    const roi = product.product_cost ? ((tp.profit / product.product_cost) * 100) : 0;
    return {
      // product
      id: product.id,
      product_name: product.product_name,
      in_seller_account: product.in_seller_account,
      ASIN: product.ASIN,
      seller_sku: product.seller_sku,
      supplier_name: product.supplier.supplier_name,
      supplier_id: product.supplier_id,
      pack_type: product.pack_type,
      product_image: product.product_image,
      supplier_item_number: product.supplier_item_number,
      upc: product.upc,

      // tracked product
      product_velocity: tp.product_velocity,
      units_sold: tp.units_sold,
      thirty_days_rank: tp.thirty_days_rank,
      ninety_days_rank: tp.ninety_days_rank,
      lowest_fba_price: tp.lowest_fba_price,
      fees: tp.fees,
      profit: tp.profit,
      roi: roi.toFixed(2),
      updatedAt: tp.updatedAt,
      sellable_quantity: tp.sellable_quantity,

      // order product
      product_id: orderProduct.product_id,
      product_cost: orderProduct.product_cost,
      purchase_order_product_id: orderProduct.id,
      total_amount: parseFloat(orderProduct?.total_amount ?? "0"), // Obtener total_amount ya en el backend
      quantity_purchased: parseInt((orderProduct?.quantity_purchased ?? 0).toString()), // Obtener cantidad comprada ya en el backend
      quantity_received: orderProduct.quantity_received,
      quantity_missing: orderProduct.quantity_missing,
      quantity_available: orderProduct.quantity_available,
      reason_id: orderProduct.reason_id,
      expire_date: orderProduct.expire_date,
    };
  });

  // Calcular el promedio de ROI
  const averageRoi = productsData.reduce((sum, p) => sum + parseFloat(p.roi), 0) / productsData.length;
  purchaseOrder.setDataValue("average_roi", averageRoi.toFixed(2));

  return res.status(200).json({
    success: true,
    data: {
      order: {
        status: purchaseOrder.purchaseOrderStatus.description,
        order_number: purchaseOrder.order_number,
        total_price: purchaseOrder.total_price,
        createdAt: purchaseOrder.createdAt,
        updatedAt: purchaseOrder.updatedAt,
        updatedStatusAt: purchaseOrder.updatedStatusAt,
        supplier_name: purchaseOrder.suppliers.supplier_name,
        supplier_id: purchaseOrder.supplier_id,
        notes: purchaseOrder.notes
      },
      purchaseOrderProducts: productsData,
    },
  });
});

exports.updatePONumber = asyncHandler(async (req, res, next) => {
  const purchaseOrderId = req.params.id;
  const { order_number } = req.body;
  const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId);
  if (!purchaseOrder) {
    return res.status(404).json({ message: "Purchase order not found" });
  }

  // Validar que no exista en la base de datos
  const existingPurchaseOrder = await PurchaseOrder.findOne({
    where: { order_number },
  });
  if (existingPurchaseOrder) {
    return res
      .status(400)
      .json({ message: "Order number already exists in the database" });
  }

  await purchaseOrder.update({ order_number });
  return res.status(200).json({
    success: true,
    data: purchaseOrder,
  });
});

exports.deletePurchaseOrderProductFromAnOrder = asyncHandler(
  async (req, res, next) => {
    const purchaseOrderProductId = req.params.purchaseOrderProductId;
    const purchaseOrderProduct = await PurchaseOrderProduct.findByPk(
      purchaseOrderProductId
    );
    if (!purchaseOrderProduct) {
      return res
        .status(404)
        .json({ message: "Purchase order product not found" });
    }
    await purchaseOrderProduct.update({ is_active: false });

    const purchaseOrder = await PurchaseOrder.findByPk(
      purchaseOrderProduct.purchase_order_id
    );
    if (!purchaseOrder) {
      return res.status(404).json({ message: "Purchase order not found" });
    }

    // Actualizar el total de la orden de compra
    await purchaseOrder.update({
      total_price:
        purchaseOrder.total_price - purchaseOrderProduct.total_amount,
    });

    return res.status(200).json({
      success: true,
      data: purchaseOrderProduct,
    });
  }
);

exports.addQuantityReceived = asyncHandler(async (req, res, next) => {
  const purchaseOrderProductId = req.params.purchaseOrderProductId;

  const purchaseOrderProduct = await PurchaseOrderProduct.findByPk(
    purchaseOrderProductId,
    {
      where: { is_active: true },
    }
  );

  if (!purchaseOrderProduct) {
    return res
      .status(404)
      .json({ message: "Purchase order product not found" });
  }

  const purchaseOrder = await PurchaseOrder.findByPk(
    purchaseOrderProduct.purchase_order_id
  );

  if (!purchaseOrder) {
    return res.status(404).json({ message: "Purchase order not found" });
  }

  const { quantityReceived } = req.body;

  if (quantityReceived == null || quantityReceived < 0) {
    return res.status(400).json({ message: "Invalid quantity received" });
  }

  // Actualizar el quantity_received
  const updatedProduct = await purchaseOrderProduct.update({
    quantity_received: quantityReceived,
    quantity_missing:
      Number(purchaseOrderProduct.quantity_purchased) -
      Number(quantityReceived),
    quantity_available: quantityReceived, // Actualizamos también quantity_available
  });

  if (!updatedProduct) {
    return res
      .status(500)
      .json({ message: "Failed to update quantity received" });
  }

  // Obtener todos los productos de la orden de compra
  const purchaseOrderProductList = await PurchaseOrderProduct.findAll({
    where: {
      purchase_order_id: purchaseOrderProduct.purchase_order_id,
      is_active: true,
    },
  });

  if (!purchaseOrderProductList) {
    return res
      .status(404)
      .json({ message: "Purchase order product list not found" });
  }

  // Verificar si todos los productos están recibidos
  const allProductsReceived = purchaseOrderProductList.every(
    (product) => product.quantity_missing === 0
  );

  if (allProductsReceived) {
    await PurchaseOrder.update(
      { purchase_order_status_id: PURCHASE_ORDER_STATUSES.CLOSED },
      { where: { id: purchaseOrderProduct.purchase_order_id } }
    );
  }

  // Recalcular el warehouse stock para el producto actualizado
  try {
    await recalculateWarehouseStock(purchaseOrderProduct.product_id);
  } catch (error) {
    console.error(`Error recalculating warehouse stock: ${error.message}`);
  }

  return res.status(200).json({
    success: true,
    data: {
      quantityMissing: updatedProduct.quantity_missing,
      allProductsReceived,
      purchaseOrderStatus: purchaseOrder.purchase_order_status_id,
    },
  });
});

exports.addNotesToPurchaseOrderProduct = asyncHandler(
  async (req, res, next) => {
    const purchaseOrderProductId = req.params.purchaseOrderProductId;
    const purchaseOrderProduct = await PurchaseOrderProduct.findByPk(
      purchaseOrderProductId,
      {
        where: { is_active: true },
      }
    );
    if (!purchaseOrderProduct) {
      return res
        .status(404)
        .json({ message: "Purchase order product not found" });
    }
    const { notes } = req.body;
    const response = await purchaseOrderProduct.update({ notes });
    if (!response) {
      return res.status(500).json({ message: "Failed to update notes" });
    } else {
      return res.status(200).json({
        success: true,
        data: purchaseOrderProduct,
      });
    }
  }
);

exports.addReasonToPOProduct = asyncHandler(async (req, res, next) => {
  const purchaseOrderProductId = req.params.purchaseOrderProductId;
  const purchaseOrderProduct = await PurchaseOrderProduct.findByPk(
    purchaseOrderProductId,
    {
      where: { is_active: true },
    }
  );
  if (!purchaseOrderProduct) {
    return res
      .status(404)
      .json({ message: "Purchase order product not found" });
  }
  const { reason_id } = req.body;

  const response = await purchaseOrderProduct.update({ reason_id });
  if (!response) {
    return res.status(500).json({ message: "Failed to update reason" });
  } else {
    return res.status(200).json({
      success: true,
      data: purchaseOrderProduct,
    });
  }
});

exports.addExpireDateToPOProduct = asyncHandler(async (req, res, next) => {
  const purchaseOrderProductId = req.params.purchaseOrderProductId;
  const purchaseOrderProduct = await PurchaseOrderProduct.findByPk(
    purchaseOrderProductId,
    {
      where: { is_active: true },
    }
  );
  if (!purchaseOrderProduct) {
    return res
      .status(404)
      .json({ message: "Purchase order product not found" });
  }
  const { expire_date } = req.body;

  const response = await purchaseOrderProduct.update({ expire_date });
  if (!response) {
    return res.status(500).json({ message: "Failed to update expire date" });
  } else {
    return res.status(200).json({
      success: true,
      data: purchaseOrderProduct,
    });
  }
});

const createPurchaseOrderProducts = async (purchaseOrderId, products) => {
  let totalPrice = 0;

  for (const product of products) {
    // console.log(product);
    const { product_id, product_cost, quantity, fees, lowest_fba_price } =
      product;
    const purchaseOrderProduct = await PurchaseOrderProduct.create({
      purchase_order_id: purchaseOrderId,
      product_id,
      product_cost: parseFloat(product_cost),
      unit_price: parseFloat(product_cost),
      quantity_purchased: quantity,
      total_amount: product_cost * quantity,
      profit: lowest_fba_price - fees - product_cost,
    });

    totalPrice += purchaseOrderProduct.total_amount;
  }

  return totalPrice;
};

const PURCHASE_ORDER_STATUSES = {
  REJECTED: 1,
  PENDING: 2,
  GOOD_TO_GO: 3,
  CANCELLED: 4,
  IN_TRANSIT: 5,
  ARRIVED: 6,
  CLOSED: 7,
  WAITING_FOR_SUPPLIER_APPROVAL: 8,
};

exports.updatePurchaseOrderStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  const purchaseOrderId = req.params.id;

  if (!Object.values(PURCHASE_ORDER_STATUSES).includes(status)) {
    return res.status(400).json({ message: "Invalid status provided" });
  }

  const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId);
  if (!purchaseOrder) {
    console.log("Purchase Order not found");
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  // Actualizar el estado de la orden
  await purchaseOrder.update({
    purchase_order_status_id: status,
    updatedStatusAt: new Date(),
  });

  return res.status(200).json({
    success: true,
    data: purchaseOrder,
  });
});

const getPurchaseOrderProducts = async (purchaseOrderId) => {
  const purchaseOrderProducts = await PurchaseOrderProduct.findAll({
    where: { purchase_order_id: purchaseOrderId, is_active: true },
  });

  for (const product of purchaseOrderProducts) {
    const productData = await Product.findOne({
      where: { id: product.product_id },
    });
    product.setDataValue("product_name", productData.product_name);
  }

  return purchaseOrderProducts;
};

exports.deletePurchaseOrder = asyncHandler(async (req, res, next) => {
  // Validar si el usuario tiene permiso
  // if (req.user.role !== 'admin') {
  //   return res.status(401).json({ message: 'Unauthorized' });
  // }

  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id);
  if (!purchaseOrder) {
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  // Actualizar el estado del Purchase Order
  await purchaseOrder.update({ is_active: false });

  // Obtener los productos asociados al Purchase Order
  const purchaseOrderProducts = await PurchaseOrderProduct.findAll({
    where: { purchase_order_id: purchaseOrder.id },
    attributes: ["product_id"],
    group: ["product_id"],
  });

  // Recalcular el stock para cada producto asociado
  for (const { product_id } of purchaseOrderProducts) {
    await recalculateWarehouseStock(product_id);
  }

  return res.status(200).json({
    success: true,
    data: purchaseOrder,
  });
});

// const asyncHandler = require("express-async-handler");
// const PDFDocument = require("pdfkit");
// const path = require("path");
// const { PurchaseOrder, PurchaseOrderProduct, Product, Supplier } = require("../models");

// Método para descargar la orden de compra
exports.downloadPurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const purchaseOrder = await PurchaseOrder.findByPk(id, {
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProducts",
        where: { is_active: true },
      },
    ],
  });

  if (!purchaseOrder) {
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  const purchaseOrderProducts = purchaseOrder.purchaseOrderProducts;
  let totalQuantity = purchaseOrderProducts.reduce(
    (total, product) => total + Number(product.quantity_purchased),
    0
  );

  let totalAmount = purchaseOrderProducts.reduce(
    (total, product) => total + parseFloat(product.total_amount),
    0
  );

  // Obtener información de los productos en una sola consulta
  const productIds = purchaseOrderProducts.map((p) => p.product_id);
  const productsData = await Product.findAll({
    where: { id: productIds },
  });

  // Crear un mapa de productos para acceder más rápido
  const productMap = new Map(productsData.map((p) => [p.id, p]));

  const products = purchaseOrderProducts.map((product) => {
    const productData = productMap.get(product.product_id);
    if (!productData) return null;

    const packType = Number(productData.pack_type) || 1;
    const product_cost = product.dataValues.product_cost / packType;
    const quantity_purchased = product.dataValues.quantity_purchased * packType;
    const total_amount = product_cost * quantity_purchased;
    console.log({
      product_cost,
      quantity_purchased,
      total_amount,
      testing: product_cost * quantity_purchased,
    })
    return {
      ASIN: productData.ASIN,
      product_id: product.dataValues.product_id,
      product_cost: product_cost.toFixed(2),
      quantity_purchased,
      total_amount: total_amount,
      pack_type: packType,
      supplier_item_number: productData.supplier_item_number,
    };
  }).filter((p) => p !== null);

  // Obtener el nombre del proveedor
  const supplier = await Supplier.findByPk(purchaseOrder.supplier_id);
  if (!supplier) {
    return res.status(404).json({ message: "Supplier not found" });
  }

  const pdfData = {
    purchaseOrder: {
      id: purchaseOrder.id,
      order_number: purchaseOrder.order_number,
      supplier_name: supplier.supplier_name,
      status: purchaseOrder.purchase_order_status_id,
      total_price: Number(purchaseOrder.total_price).toFixed(2),
      total_quantity: totalQuantity,
      total_amount: parseFloat(totalAmount).toFixed(2),
      notes: purchaseOrder.notes || "",
    },
    products,
  };

  // Generar PDF
  const pdfBuffer = await generatePDF(pdfData);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=purchase-order.pdf");
  res.send(pdfBuffer);
});

const generatePDF = (data) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    const logoPath = path.join(__dirname, "../data/top_values_brand_logo.jpg");

    doc.image(logoPath, 200, 10, { width: 200, align: "center" });
    doc.moveDown(8);
    doc.text(`DATE: ${new Date().toLocaleDateString()}`);
    doc.moveDown(1);
    doc.fontSize(12).text("ISSUED TO:", { bold: true });
    doc.moveDown(1);
    doc.text(`${data.purchaseOrder.supplier_name}`);
    doc.text("Top Value Brands 1141 Holland Dr 8 Boca Raton");
    doc.text("FL 33487 USA");
    doc.moveDown();
    doc.fontSize(12).text(`Order ID: ${data.purchaseOrder.order_number}`);
    doc.moveDown(3);

    const TABLE_LEFT = 70;
    const TABLE_TOP = 350;
    const itemDistanceY = 20;

    // Table Headers
    doc.fillColor("blue").fontSize(12);
    doc.text("ITEM NO.", TABLE_LEFT, TABLE_TOP, { bold: true });
    doc.text("UNIT PRICE", TABLE_LEFT + 180, TABLE_TOP, { bold: true });
    doc.text("QUANTITY", TABLE_LEFT + 300, TABLE_TOP, { bold: true });
    doc.text("TOTAL", TABLE_LEFT + 400, TABLE_TOP, { bold: true });

    let position = TABLE_TOP + itemDistanceY;
    data.products.forEach((product, index) => {
      console.log(product)
      if (index % 2 === 0) {
        doc.rect(TABLE_LEFT - 10, position - 5, 500, itemDistanceY).fill("#f2f2f2").stroke();
      }
      doc.fillColor("black");
      doc.text(product.supplier_item_number, TABLE_LEFT, position);
      doc.text(`$${product.product_cost}`, TABLE_LEFT + 180, position);
      doc.text(product.quantity_purchased, TABLE_LEFT + 300, position);
      doc.text(`$${product.total_amount}`, TABLE_LEFT + 400, position);
      position += itemDistanceY;
    });

    // Subtotal y Total
    doc.moveDown(3);
    doc.fillColor("black").text(`SUBTOTAL: $ ${data.purchaseOrder.total_amount}`, TABLE_LEFT);

    // Notas de la orden
    if (data.purchaseOrder.notes) {
      doc.moveDown(2);
      doc.text("ORDER NOTES:", TABLE_LEFT);
      doc.moveDown();
      doc.text(data.purchaseOrder.notes);
    }

    doc.text("Thank you for your business!", { bold: true, align: "center" });
    doc.text("www.topvaluebrands.com", { bold: true, align: "center" });

    doc.end();
  });
};
