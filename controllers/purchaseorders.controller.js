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
const { where, Transaction } = require("sequelize");
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

exports.updatedPurchaseOrder = asyncHandler(async (req, res, next) => {
  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id);

  const { notes } = req.body;

  if (!purchaseOrder) {
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  const updatedPurchaseOrder = await purchaseOrder.update({ notes: notes });
  return res.status(200).json({
    success: true,
    data: {
      notes: updatedPurchaseOrder.notes,
      message: "Notes updated successfully",
    },
  });
});

exports.addProductToPurchaseOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { products } = req.body;

  // check if the products are not already in the purchase order
  const existingProducts = await PurchaseOrderProduct.findAll({
    where: { purchase_order_id: id, is_active: true },
  });

  for (const product of products) {
    const existingProduct = existingProducts.find(
      (p) => p.product_id === product.product_id
    );
    if (existingProduct) {
      return res.status(400).json({
        message: `Product ${product.product_id} is already in the purchase order`,
      });
    }
  }

  const supplier_id = await PurchaseOrder.findByPk(id, {
    attributes: ["supplier_id"],
  });
  if (!supplier_id) {
    return res.status(404).json({ message: "Supplier not found" });
  }

  // check if the supplier product is the same as the one in the purchase order
  for (const product of products) {
    const supplierProduct = await Product.findByPk(product.product_id);
    if (supplierProduct.supplier_id !== supplier_id.supplier_id) {
      return res.status(400).json({
        message: `Product ${product.product_id} does not belong to supplier ${supplier_id.values}`,
      });
    }
  }

  const transaction = await sequelize.transaction(); // Inicia la transacción

  try {
    const purchaseOrder = await PurchaseOrder.findByPk(id, { transaction });
    if (!purchaseOrder) {
      return res.status(404).json({ message: "Purchase Order not found" });
    }

    // Creación de entradas de `PurchaseOrderProduct` y cálculo del total
    let newAmount = 0;
    if (products && products.length > 0) {
      newAmount = await createPurchaseOrderProducts(purchaseOrder.id, products);
    }

    // Actualiza el precio total de la orden de compra en la misma transacción
    await purchaseOrder.update(
      { total_price: parseFloat(purchaseOrder.total_price) + newAmount },
      { transaction }
    );

    // Commit de la transacción si todas las operaciones son exitosas
    await transaction.commit();

    // Consulta la orden de compra actualizada junto con sus productos
    const updatedPurchaseOrder = await PurchaseOrder.findByPk(
      purchaseOrder.id,
      {
        include: [
          {
            model: PurchaseOrderProduct,
            as: "purchaseOrderProducts",
          },
        ],
      }
    );

    return res.status(201).json({
      success: true,
      data: updatedPurchaseOrder,
    });
  } catch (error) {
    // Rollback de la transacción en caso de error
    await transaction.rollback();
    return next(error);
  }
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
      },
    ],
  });

  return res.status(200).json({
    success: true,
    data: purchaseOrder,
  });
});

exports.getPurchaseOrders = asyncHandler(async (req, res, next) => {
  const purchaseOrders = await PurchaseOrder.findAll({
    where: { is_active: true },
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProducts",
        where: { is_active: true },
      },
      {
        model: PurchaseOrderStatus,
        as: "purchaseOrderStatus", // Incluido el modelo con alias
        attributes: ["description"], // Solo trae el campo 'description'
      },
    ],
  });

  // Obtener supplier_name para cada purchase order
  await Promise.all(
    purchaseOrders.map(async (purchaseOrder) => {
      const purchaseSupplier = await Supplier.findByPk(
        purchaseOrder.supplier_id
      );
      purchaseOrder.setDataValue(
        "supplier_name",
        purchaseSupplier.supplier_name
      );

      // Utiliza la asociación ya existente para obtener la descripción
      const statusDescription = purchaseOrder.purchaseOrderStatus?.description;
      purchaseOrder.setDataValue("status", statusDescription || "Unknown");
    })
  );

  // Obtener product_name para cada purchase order product
  await Promise.all(
    purchaseOrders.map(async (purchaseOrder) => {
      await Promise.all(
        purchaseOrder.purchaseOrderProducts.map(
          async (purchaseOrderProduct) => {
            const purchaseProduct = await Product.findByPk(
              purchaseOrderProduct.product_id,
              {
                where: { is_active: true },
              }
            );
            purchaseOrderProduct.setDataValue(
              "product_name",
              purchaseProduct.product_name
            );
            purchaseOrderProduct.setDataValue(
              "quantity_missing",
              purchaseOrderProduct.quantity_purchased -
                (purchaseOrderProduct.quantity_received || 0)
            );
          }
        )
      );
    })
  );

  // Calcular el ROI promedio para cada purchase order
  await Promise.all(
    purchaseOrders.map(async (purchaseOrder) => {
      const purchaseOrderProducts = purchaseOrder.purchaseOrderProducts;
      const roiArr = [];

      // Obtener todos los IDs de productos de la orden de compra
      const productIds = purchaseOrderProducts.map(
        (purchaseOrderProduct) => purchaseOrderProduct.product_id
      );

      // Obtener productos rastreados y productos de la orden
      const [trackedProductsOfTheOrder, productsOfTheOrder] = await Promise.all(
        [
          TrackedProduct.findAll({ where: { product_id: productIds } }),
          Product.findAll({ where: { id: productIds } }),
        ]
      );

      // Calcular el ROI de cada producto rastreado
      trackedProductsOfTheOrder.forEach((trackedProduct) => {
        const product = productsOfTheOrder.find(
          (product) => product.id === trackedProduct.product_id
        );

        if (product && product.product_cost !== 0) {
          const profit = (trackedProduct.profit / product.product_cost) * 100;
          roiArr.push(profit);
        }
      });

      // Calcular el promedio de ROI y establecer el valor
      const totalRoi = roiArr.reduce((a, b) => a + b, 0);
      purchaseOrder.setDataValue("average_roi", totalRoi / roiArr.length);
    })
  );

  await Promise.all(
    purchaseOrders.map(async (purchaseOrder) => {
      // 1. get the purchaseorderproducts by purchase_order_id
      const products = await PurchaseOrderProduct.findAll({
        where: { purchase_order_id: purchaseOrder.id },
      });
      if (!products) {
        return res.status(404).json({ message: "Products not found" });
      }

      // 2. get the trackedproducts by product_id
      const trackedProducts = await TrackedProduct.findAll({
        where: { product_id: products.map((product) => product.product_id) },
      });
      if (!trackedProducts) {
        return res.status(404).json({ message: "Tracked products not found" });
      }

      // 3. transform the trackedproducts to include product_name, ASIN, seller_sku, supplier_name, product_image

      const trackedProductInTheOrder = await Promise.all(
        trackedProducts.map(async (trackedProduct) => {
          const product = await Product.findOne({
            where: { id: trackedProduct.product_id },
          });
          if (!product) {
            return res.status(404).json({ message: "Product not found" });
          }

          const supplier = await Supplier.findOne({
            where: { id: product.supplier_id },
          });
          if (!supplier) {
            return res.status(404).json({ message: "Supplier not found" });
          }

          return {
            ...trackedProduct.toJSON(),
            product_name: product.product_name,
            ASIN: product.ASIN,
            seller_sku: product.seller_sku,
            supplier_name: supplier.supplier_name,
            product_image: product.product_image,
            product_cost: product.product_cost,
          };
        })
      );

      purchaseOrder.setDataValue("trackedProducts", trackedProductInTheOrder);
    })
  );

  return res.status(200).json({
    success: true,
    data: purchaseOrders,
  });
});

exports.getPurchaseOrderSummaryByID = asyncHandler(async (req, res, next) => {
  const purchaseOrderId = req.params.id;

  const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, {
    where: { is_active: true },
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProducts",
        where: { is_active: true },
      },
      {
        model: PurchaseOrderStatus,
        as: "purchaseOrderStatus",
        attributes: ["description"],
      },
    ],
  });

  // 1. get the purchaseorderproducts by purchase_order_id
  const products = await PurchaseOrderProduct.findAll({
    where: { purchase_order_id: req.params.id, is_active: true },
  });
  if (!products) {
    return res.status(404).json({ message: "Products not found" });
  }

  // 2. get the trackedproducts by product_id
  const trackedProducts = await TrackedProduct.findAll({
    where: { product_id: products.map((product) => product.product_id) },
  });
  if (!trackedProducts) {
    return res.status(404).json({ message: "Tracked products not found" });
  }

  // 3. transform the trackedproducts to include product_name, ASIN, seller_sku, supplier_name, product_image

  const productsOfTheOrder = await Promise.all(
    trackedProducts.map(async (trackedProduct) => {
      const product = await Product.findOne({
        where: { id: trackedProduct.product_id },
      });
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const supplier = await Supplier.findOne({
        where: { id: product.supplier_id },
      });
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }

      return {
        ...trackedProduct.toJSON(),
        product_name: product.product_name,
        product_id: product.id,
        upc: product.upc,
        ASIN: product.ASIN,
        seller_sku: product.seller_sku,
        supplier_name: supplier.supplier_name,
        product_image: product.product_image,
        product_cost: product.product_cost,
        in_seller_account: product.in_seller_account,
        supplier_item_number: product.supplier_item_number,
        pack_type: product.pack_type,
      };
    })
  );

  // 4. return the transformed trackedproducts
  const trackedProductsOfTheOrder = productsOfTheOrder.map((product) => {
    const {
      product_name,
      ASIN,
      seller_sku,
      supplier_name,
      product_image,
      product_cost,
      ...trackedProducts
    } = product;
    return {
      ...trackedProducts,
      product_name,
      ASIN,
      seller_sku,
      supplier_name,
      product_image,
      product_cost,
    };
  });

  const roiArr = [];

  // Calcular el ROI de cada producto rastreado
  trackedProductsOfTheOrder.forEach((trackedProduct) => {
    const product = productsOfTheOrder.find(
      (product) => product.id === trackedProduct.product_id
    );

    if (product && product.product_cost !== 0) {
      const profit = (trackedProduct.profit / product.product_cost) * 100;
      roiArr.push(profit);
    }
  });

  // Calcular el promedio de ROI y establecer el valor
  const totalRoi = roiArr.reduce((a, b) => a + b, 0);
  purchaseOrder.setDataValue("average_roi", totalRoi / roiArr.length);

  return res.status(200).json({
    success: true,
    data: {
      purchaseOrder,
      trackedProductsOfTheOrder,
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

// Método para descargar la orden de compra
exports.downloadPurchaseOrder = asyncHandler(async (req, res, next) => {
  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id, {
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

  // console.log(purchaseOrderProducts[0].dataValues);
  //log every purchaseOrderProduct from the purchaseOrderProducts array

  let totalQuantity = 0;

  for (const product of purchaseOrderProducts) {
    // console.log(product.dataValues);
    totalQuantity += parseInt(product.dataValues.quantity_purchased);
  }

  const totalPrice = purchaseOrder.total_price;
  // const totalQuantity = purchaseOrderProducts.reduce(
  //   (total, product) => parseInt(total) + parseInt(product.quantity),
  //   0
  // );
  const totalAmount = purchaseOrderProducts.reduce(
    (total, product) => Number(total) + Number(product.total_amount),
    0
  );

  // Obtener los nombres de los productos de forma asíncrona
  const products = await Promise.all(
    purchaseOrderProducts.map(async (product, i) => {
      const productData = await Product.findOne({
        where: { id: product.product_id },
      });
      if (!productData) {
        return null;
      }

      console.log(product);

      const unit_price = parseInt(productData.dataValues.pack_type)
        ? product.dataValues.unit_price /
          parseInt(productData.dataValues.pack_type)
        : product.dataValues.unit_price;
      const quantity_purchased = parseInt(productData.dataValues.pack_type)
        ? product.quantity_purchased *
          parseInt(productData.dataValues.pack_type)
        : product.quantity_purchased;
      const total_amount = unit_price * quantity_purchased;

      return {
        ASIN: productData.dataValues.ASIN,
        product_id: product.product_id,
        product_cost: unit_price,
        quantity_purchased: quantity_purchased,
        total_amount: total_amount,
        pack_type: parseInt(productData.dataValues.pack_type),
        supplier_item_number: productData.dataValues.supplier_item_number,
      };
    })
  );

  // Filtrar productos nulos (en caso de que no se encuentren algunos productos)
  const filteredProducts = products.filter((product) => product !== null);

  const supplierName = await Supplier.findOne({
    where: { id: purchaseOrder.supplier_id },
  });
  if (!supplierName) {
    return res.status(404).json({ message: "Supplier not found" });
  }
  const supplierNameValue = supplierName.supplier_name;

  const pdfData = {
    purchaseOrder: {
      id: purchaseOrder.id,
      order_number: purchaseOrder.order_number,
      supplier_name: supplierNameValue,
      status: purchaseOrder.purchase_order_status_id,
      total_price: totalPrice,
      total_quantity: totalQuantity,
      total_amount: totalAmount,
      notes: purchaseOrder.notes,
    },
    products: filteredProducts,
  };

  // console.log(pdfData);

  const pdfBuffer = await generatePDF(pdfData);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=purchase-order.pdf"
  );
  res.send(pdfBuffer);
});

const generatePDF = (data) => {
  // console.log(data);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    let buffers = [];

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      let pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

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
    doc
      .fillColor("blue")
      .fontSize(12)
      .text("ITEM NO.", TABLE_LEFT, TABLE_TOP, { extraBold: true });
    // doc.text('ASIN', TABLE_LEFT + 70, TABLE_TOP, { bold: true });
    doc.text("UNIT PRICE", TABLE_LEFT + 180, TABLE_TOP, { bold: true });
    doc.text("QUANTITY", TABLE_LEFT + 300, TABLE_TOP, { bold: true });
    doc.text("TOTAL", TABLE_LEFT + 400, TABLE_TOP, { bold: true });

    let position = TABLE_TOP + itemDistanceY;
    data.products.forEach((product, index) => {
      // Background color for each row
      if (index % 2 === 0) {
        doc
          .rect(TABLE_LEFT - 10, position - 5, 500, itemDistanceY)
          .fill("#f2f2f2")
          .stroke();
      }
      doc.fillColor("black");
      doc.text(product.supplier_item_number, TABLE_LEFT, position);
      // doc.text(product.ASIN, TABLE_LEFT + 70, position);
      doc.text(
        "$" + Number(product.product_cost).toFixed(2),
        TABLE_LEFT + 180,
        position
      );
      doc.text(product.quantity_purchased, TABLE_LEFT + 300, position);
      doc.text(
        "$" + Number(product.total_amount).toFixed(2),
        TABLE_LEFT + 400,
        position
      );
      position += itemDistanceY;
    });

    // Subtotal and Total
    doc.moveDown(3);
    doc
      .fillColor("black")
      .text(
        `SUBTOTAL:   $ ${Number(data.purchaseOrder.total_amount).toFixed(2)}`,
        TABLE_LEFT
      );

    // Order Notes
    doc.moveDown(2);
    doc.text("ORDER NOTES:", TABLE_LEFT);
    doc.moveDown();
    doc.text(data.purchaseOrder.notes);

    doc.text(
      "Thank you for your business!",
      { bold: true, align: "center" },
      doc.page.height - 150
    );
    doc.text("www.topvaluebrands.com", { bold: true, align: "center" });

    doc.end();
  });
};
