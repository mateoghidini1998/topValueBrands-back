const asyncHandler = require("../middlewares/async");
const {
  Product,
  PurchaseOrder,
  PurchaseOrderProduct,
  Supplier,
  TrackedProduct,
  PurchaseOrderStatus,
  PurchaseOrderProductReason,
  AmazonProductDetail,
  WalmartProductDetail,
} = require("../models");
const { addUPCToPOProduct: addUPC } = require("./products.controller");
const path = require("path");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const { where, Transaction, or, Op } = require("sequelize");

const MarkdownIt = require('markdown-it');
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

exports.mergePurchaseOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { purchaseOrderIds } = req.body;

  if (!purchaseOrderIds || !Array.isArray(purchaseOrderIds) || purchaseOrderIds.length === 0) {
    return res.status(400).json({ msg: "Invalid purchaseOrderIds" });
  }

  const transaction = await sequelize.transaction();

  try {
    // Obtener la orden de compra destino
    const purchaseOrderToMerge = await PurchaseOrder.findByPk(id, { transaction });
    if (!purchaseOrderToMerge || purchaseOrderToMerge.purchase_order_status_id !== 2) {
      await transaction.rollback();
      return res.status(404).json({ msg: "Purchase Order status should be Pending" });
    }

    // Obtener las órdenes de compra a fusionar
    const purchaseOrders = await PurchaseOrder.findAll({
      where: {
        id: purchaseOrderIds,
        purchase_order_status_id: 2,
        is_active: true,
        supplier_id: purchaseOrderToMerge.supplier_id,
      },
      transaction,
    });
    if (purchaseOrders.length !== purchaseOrderIds.length) {
      await transaction.rollback();
      return res.status(404).json({ msg: "Invalid orders are selected to merge" });
    }

    // Obtener productos de todas las órdenes a fusionar
    const productsToMerge = await PurchaseOrderProduct.findAll({
      where: { purchase_order_id: purchaseOrderIds, is_active: true },
      transaction,
    });
    if (productsToMerge.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ msg: "No products to merge" });
    }

    // Obtener productos existentes en la orden destino y mapearlos por product_id
    const existingProducts = await PurchaseOrderProduct.findAll({
      where: { purchase_order_id: id, is_active: true },
      transaction,
    });
    const existingProductMap = new Map();
    existingProducts.forEach(p => {
      existingProductMap.set(p.product_id, p);
    });

    // Actualizar los productos duplicados
    for (const product of productsToMerge) {
      if (existingProductMap.has(product.product_id)) {
        const existingProduct = existingProductMap.get(product.product_id);
        const newQuantity = existingProduct.quantity_purchased + product.quantity_purchased;
        const newTotalAmount = existingProduct.product_cost * newQuantity;

        await existingProduct.update(
          {
            quantity_purchased: newQuantity,
            total_amount: newTotalAmount,
          },
          { transaction }
        );

        // Eliminar el producto duplicado después de actualizar
        await product.destroy({ transaction });
      }
    }

    // Asignar a la orden destino los productos que no eran duplicados
    await PurchaseOrderProduct.update(
      { purchase_order_id: id },
      { where: { purchase_order_id: purchaseOrderIds }, transaction }
    );

    // Recalcular el total_price basado en los productos finales de la orden destino
    const updatedProducts = await PurchaseOrderProduct.findAll({
      where: { purchase_order_id: id },
      transaction,
    });
    const newTotalPrice = updatedProducts.reduce((sum, p) => {
      return sum + parseFloat(p.product_cost) * p.quantity_purchased;
    }, 0);
    await purchaseOrderToMerge.update({ total_price: newTotalPrice }, { transaction });

    // Concatenar notas de todas las órdenes de compra
    const allNotes = [purchaseOrderToMerge.notes, ...purchaseOrders.map(po => po.notes)]
      .filter(Boolean)
      .join("\n");
    await purchaseOrderToMerge.update({ notes: allNotes }, { transaction });

    // Eliminar las órdenes de compra que fueron fusionadas
    await PurchaseOrder.destroy({ where: { id: purchaseOrderIds }, transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      data: "Purchase Orders merged successfully",
    });

  } catch (error) {
    await transaction.rollback();

    // Manejo específico para error de restricción de clave foránea
    if (error.name === "SequelizeForeignKeyConstraintError") {
      console.error("Error merging purchase orders - Foreign Key Constraint:", error);
      return res.status(409).json({
        msg: "No se puede eliminar o actualizar la orden de compra, ya que tiene registros asociados en 'pallets'."
      });
    }

    console.error("Error merging purchase orders:", error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
});



exports.updatePurchaseOrder = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const purchaseOrder = await PurchaseOrder.findByPk(req.params.id, {
      include: [
        {
          model: PurchaseOrderProduct,
          as: "purchaseOrderProducts",
        },
      ],
      transaction
    });

    if (!purchaseOrder) {
      await transaction.rollback();
      return res.status(404).json({ message: "Purchase Order not found" });
    }

    const {
      notes,
      purchase_order_status_id,
      products,
    } = req.body;

    // Update purchase order fields
    const updateFields = {};
    if (notes) updateFields.notes = notes;
    if (purchase_order_status_id) updateFields.purchase_order_status_id = purchase_order_status_id;

    if (Object.keys(updateFields).length > 0) {
      await purchaseOrder.update(updateFields, { transaction });
    }

    if (products && products.length > 0) {
      // Get all existing products including inactive ones
      const existingProducts = await PurchaseOrderProduct.findAll({
        where: {
          purchase_order_id: purchaseOrder.id
        },
        transaction
      });

      const existingProductIds = existingProducts.map(p => p.product_id);
      const updatedProductIds = products.map(p => p.product_id);

      // Find products to add (not in existing products)
      const productsToAdd = products.filter(
        p => !existingProductIds.includes(p.product_id)
      );

      // Find products to deactivate
      const productsToDeactivate = existingProductIds.filter(
        id => !updatedProductIds.includes(id)
      );

      // Soft delete by setting is_active to false
      if (productsToDeactivate.length > 0) {
        await PurchaseOrderProduct.update(
          { is_active: false },
          {
            where: {
              purchase_order_id: purchaseOrder.id,
              product_id: productsToDeactivate
            },
            transaction
          }
        );
      }

      // Update existing products
      for (const product of products) {
        const existingProduct = existingProducts.find(
          p => p.product_id === product.product_id
        );

        if (existingProduct) {
          const newProductCost = parseFloat(product.product_cost);
          const quantity = parseInt(product.quantity);
          const fees = parseFloat(product.fees || 0);
          const lowest_fba_price = parseFloat(product.lowest_fba_price || 0);

          // Calculate new profit
          const newProfit = lowest_fba_price - fees - newProductCost;

          await PurchaseOrderProduct.update(
            {
              quantity_purchased: quantity,
              product_cost: newProductCost,
              total_amount: quantity * newProductCost,
              profit: newProfit,
              is_active: true,
              unit_price: newProductCost
            },
            {
              where: { id: existingProduct.id },
              transaction
            }
          );
        }
      }

      // Add new products
      if (productsToAdd.length > 0) {
        const newProducts = productsToAdd.map(product => ({
          purchase_order_id: purchaseOrder.id,
          product_id: product.product_id,
          quantity_purchased: parseInt(product.quantity),
          product_cost: parseFloat(product.product_cost),
          total_amount: parseInt(product.quantity) * parseFloat(product.product_cost),
          profit: parseFloat(product.lowest_fba_price || 0) - parseFloat(product.fees || 0) - parseFloat(product.product_cost),
          unit_price: parseFloat(product.product_cost),
          is_active: true,
          quantity_received: 0
        }));

        await PurchaseOrderProduct.bulkCreate(newProducts, { transaction });
      }

      // Calculate total price only from active products
      const activeProducts = await PurchaseOrderProduct.findAll({
        where: {
          purchase_order_id: purchaseOrder.id,
          is_active: true
        },
        transaction
      });

      const totalPrice = activeProducts.reduce(
        (sum, prod) => sum + (prod.quantity_purchased * parseFloat(prod.product_cost)),
        0
      );

      await purchaseOrder.update(
        { total_price: totalPrice },
        { transaction }
      );
    }

    await transaction.commit();

    // Fetch final updated purchase order with only active products
    const updatedPurchaseOrder = await PurchaseOrder.findByPk(purchaseOrder.id, {
      include: [
        {
          model: PurchaseOrderProduct,
          as: "purchaseOrderProducts",
          where: { is_active: true }
        },
      ],
    });

    return res.status(200).json({
      success: true,
      data: updatedPurchaseOrder,
    });
  } catch (error) {
    console.error('Error in updatePurchaseOrder:', error);
    console.error('Error stack:', error.stack);
    await transaction.rollback();
    return next(error);
  }
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

  const atLeastOneReceived = purchaseorderproducts.some(
    (p) => p.quantity_received > 0
  );

  if (allReceived) {
    await PurchaseOrder.update(
      { purchase_order_status_id: PURCHASE_ORDER_STATUSES.CLOSED },
      { where: { id: purchaseOrder.id } }
    );
  } else {
    if (atLeastOneReceived && purchaseOrder.purchase_order_status_id === PURCHASE_ORDER_STATUSES.IN_TRANSIT) {
      await PurchaseOrder.update(
        { purchase_order_status_id: PURCHASE_ORDER_STATUSES.ARRIVED },
        { where: { id: purchaseOrder.id } }
      );
    }
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

  for (const purchaseOrderProductUpdate of purchaseOrderProductsUpdates) {
    const purchaseOrderProduct = purchaseorderproducts.find(
      (p) => p.id === purchaseOrderProductUpdate.purchaseOrderProductId
    );

    if (purchaseOrderProduct) {
      const oldProductCost = purchaseOrderProduct.product_cost;
      purchaseOrderProduct.product_cost = parseFloat(
        purchaseOrderProductUpdate.product_cost
      );
      purchaseOrderProduct.quantity_purchased = parseInt(
        purchaseOrderProductUpdate.quantityPurchased
      );
      purchaseOrderProduct.total_amount =
        purchaseOrderProduct.product_cost *
        purchaseOrderProduct.quantity_purchased;


      // Calcular el profit correctamente usando el costo anterior
      const newProfit = parseFloat(
        purchaseOrderProduct.profit - (purchaseOrderProduct.product_cost - oldProductCost)
      );
      purchaseOrderProduct.profit = newProfit;

      const updatedPurchaseOrderProduct = await purchaseOrderProduct.save();

      if (updatedPurchaseOrderProduct) {
        const purchaseOrderProducts = await getPurchaseOrderProducts(
          purchaseOrder.id
        );
        const totalPrice = purchaseOrderProducts.reduce((acc, product) => {
          return acc + product.product_cost * product.quantity_purchased;
        }, 0);
        await purchaseOrder.update({ total_price: totalPrice });
      }

    } else {
      return res.status(404).json({
        message: `Purchase Order Product not found: ${purchaseOrderProductUpdate.purchaseOrderProductId}`,
      });
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
    const possibleStatuses = [1, 2, 3, 8];
    const whereConditions = {
      is_active: true,

      purchase_order_status_id: possibleStatuses.find(id => id === parseInt(statusId)) || possibleStatuses,
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
          where: { is_active: true },
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
            ? (product.profit / product.product_cost) * 100
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
  const statusId = req.query.status || null;
  const excludeStatus = req.query.excludeStatus || null;
  const orderBy = req.query.orderBy || 'updatedAt';
  const orderWay = req.query.orderWay || 'DESC';

  try {
    const possibleStatuses = [4, 5, 6, 7];
    const whereConditions = {
      is_active: true,
    };

    if (statusId) {
      // If a specific status is provided, filter by that status
      whereConditions.purchase_order_status_id = parseInt(statusId);
    } else {
      // If no specific status is provided, use the possible statuses
      whereConditions.purchase_order_status_id = { [Op.in]: possibleStatuses };
    }

    if (excludeStatus) {
      // If exclude status is provided, add it to the where conditions
      const statusesToExclude = excludeStatus.split(",").map(Number);
      if (statusId) {
        // If a specific status is provided, make sure it's not in the excluded list
        if (statusesToExclude.includes(parseInt(statusId))) {
          return res.status(400).json({
            success: false,
            msg: "The specified status cannot be both included and excluded",
          });
        }
      } else {
        // If no specific status is provided, exclude the specified statuses from the possible statuses
        whereConditions.purchase_order_status_id = {
          [Op.and]: [
            { [Op.in]: possibleStatuses },
            { [Op.notIn]: statusesToExclude },
          ],
        };
      }
    }

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
      distinct: true,
      limit,
      offset,
      order: [[orderBy, orderWay]],
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

  // 1. Obtener la orden con productos y estado
  const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, {
    where: { is_active: true },
    include: [
      {
        model: PurchaseOrderProduct,
        as: "purchaseOrderProducts",
        where: { is_active: true },
        attributes: [
          "product_id", "quantity_purchased", "quantity_received",
          "quantity_missing", "quantity_available", "product_cost",
          "total_amount", "id", "reason_id", "expire_date", "profit"
        ],
        include: {
          model: PurchaseOrderProductReason,
          attributes: ["description"]
        },
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

  // 2. TrackedProducts con Amazon info
  const trackedProducts = await TrackedProduct.findAll({
    where: { product_id: { [Op.in]: productIds } },
    include: [
      {
        model: Product,
        as: "product",
        attributes: [
          "product_name", "id", "supplier_id", "product_image",
          "product_cost", "in_seller_account", "supplier_item_number",
          "pack_type", "upc", "warehouse_stock"
        ],
        include: [
          {
            model: AmazonProductDetail,
            as: "AmazonProductDetail",
            attributes: ["ASIN", "seller_sku", "dangerous_goods"]
          },
          {
            model: Supplier,
            as: "supplier",
            attributes: ["supplier_name"]
          }
        ]
      }
    ]
  });

  // 3. Walmart products (para los que no tienen TrackedProduct)
  const walmartProducts = await Product.findAll({
    where: { id: { [Op.in]: productIds } },
    include: [
      {
        model: WalmartProductDetail,
        as: "WalmartProductDetail",
        attributes: ["gtin", "seller_sku"]
      },
      {
        model: Supplier,
        as: "supplier",
        attributes: ["supplier_name"]
      }
    ]
  });

  // 4. Crear mapas de lookup
  const trackedMap = new Map();
  trackedProducts.forEach(tp => trackedMap.set(tp.product_id, tp));

  const productMap = new Map();
  walmartProducts.forEach(p => productMap.set(p.id, p));

  // 5. Armar la respuesta basada en purchaseOrderProducts
  const productsData = purchaseOrder.purchaseOrderProducts.map(orderProduct => {
    const tracked = trackedMap.get(orderProduct.product_id);
    const product = tracked?.product || productMap.get(orderProduct.product_id);
    const amazonDetail = tracked?.product?.AmazonProductDetail || null;
    const walmartDetail = product?.WalmartProductDetail || null;

    const roi = orderProduct.product_cost
      ? ((orderProduct.profit / orderProduct.product_cost) * 100)
      : 0;

    const marketplace = amazonDetail
      ? 'Amazon'
      : walmartDetail
        ? 'Walmart'
        : 'Unknown';

    return {
      id: product?.id,
      product_name: product?.product_name,
      in_seller_account: product?.in_seller_account,
      ASIN: amazonDetail?.ASIN || null,
      GTIN: walmartDetail?.gtin || null,
      seller_sku: amazonDetail?.seller_sku || walmartDetail?.seller_sku || null,
      supplier_name: product?.supplier?.supplier_name || null,
      supplier_id: product?.supplier_id,
      pack_type: parseInt(product?.pack_type),
      product_image: product?.product_image,
      supplier_item_number: product?.supplier_item_number,
      upc: product?.upc,
      warehouse_stock: product?.warehouse_stock,
      dg_item: amazonDetail?.dangerous_goods || false,
      marketplace,

      product_velocity: tracked?.product_velocity || null,
      units_sold: tracked?.units_sold || null,
      thirty_days_rank: tracked?.thirty_days_rank || null,
      ninety_days_rank: tracked?.ninety_days_rank || null,
      lowest_fba_price: tracked?.lowest_fba_price || null,
      fees: parseFloat(tracked?.fees || 0),
      roi: parseFloat(roi.toFixed(2)),
      updatedAt: tracked?.updatedAt || product?.updatedAt || null,
      sellable_quantity: tracked?.sellable_quantity || null,

      product_id: orderProduct.product_id,
      product_cost: parseFloat(orderProduct.product_cost),
      purchase_order_product_id: orderProduct.id,
      total_amount: parseFloat(orderProduct?.total_amount ?? "0"),
      quantity_purchased: parseInt(orderProduct?.quantity_purchased ?? 0),
      quantity_received: orderProduct.quantity_received,
      quantity_missing: orderProduct.quantity_missing,
      quantity_available: orderProduct.quantity_available,
      reason_id: orderProduct.reason_id,
      reason: orderProduct?.PurchaseOrderProductReason?.description || "Unknown",
      expire_date: orderProduct.expire_date,
      profit: parseFloat(orderProduct.profit)
    };
  });

  // 6. Ordenar: productos peligrosos al final
  productsData.sort((a, b) => (a.dg_item === b.dg_item) ? 0 : a.dg_item ? 1 : -1);

  // 7. Promedio ROI
  const averageRoi = productsData.reduce((sum, p) => sum + parseFloat(p.roi || 0), 0) / productsData.length;
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
        notes: purchaseOrder.notes,
        incoming_order_notes: purchaseOrder.incoming_order_notes,
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


exports.updateIncomingOrderNotes = asyncHandler(async (req, res, next) => {
  const orderId = req.params.orderId;
  const { incoming_order_notes } = req.body;
  const order = await PurchaseOrder.findByPk(orderId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  await order.update({ incoming_order_notes });
  return res.status(200).json({
    success: true,
    data: order,
  });
})


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
    const { product_id, product_cost, quantity, fees, lowest_fba_price } =
      product;
    const purchaseOrderProduct = await PurchaseOrderProduct.create({
      purchase_order_id: purchaseOrderId,
      product_id,
      product_cost: parseFloat(product_cost),
      unit_price: parseFloat(product_cost),
      quantity_purchased: quantity,
      total_amount: product_cost * quantity,
      profit: lowest_fba_price - (fees + product_cost),
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
const md = new MarkdownIt();

// Handler para descargar la orden de compra en PDF
exports.downloadPurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Traer orden y productos activos
  const purchaseOrder = await PurchaseOrder.findByPk(id, {
    include: [{
      model: PurchaseOrderProduct,
      as: 'purchaseOrderProducts',
      where: { is_active: true }
    }]
  });
  if (!purchaseOrder) return res.status(404).json({ message: 'Purchase Order not found' });

  // Obtener datos de producto en una sola consulta
  const productIds = purchaseOrder.purchaseOrderProducts.map(p => p.product_id);
  const productsData = await Product.findAll({ where: { id: productIds } });
  const productMap = new Map(productsData.map(p => [p.id, p]));

  // Mapear items con cálculos numéricos puros
  const items = purchaseOrder.purchaseOrderProducts.map((poProd, i) => {
    const pd = productMap.get(poProd.product_id);
    const packType = Number(pd.pack_type) || 1;
    const unitCost = poProd.product_cost / (packType || 1);
    const qty = Number(poProd.quantity_purchased) * (packType || 1);
    return {
      supplier_item_number: pd.supplier_item_number || 'n/a - ' + (i + 1),
      product_id: pd.id,
      unitCost,       // number
      quantity: qty,  // number
      total: unitCost * qty // number
    };
  });

  // Obtener proveedor
  const supplier = await Supplier.findByPk(purchaseOrder.supplier_id);
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

  // Datos que pasaremos al generador
  const pdfData = {
    order: {
      number: purchaseOrder.order_number,
      date: new Date(),
      supplierName: supplier.supplier_name,
      notes: purchaseOrder.notes || ''
    },
    items
  };

  // Generar buffer y enviarlo
  const pdfBuffer = await generatePDF(pdfData);
  res
    .setHeader('Content-Type', 'application/pdf')
    .setHeader('Content-Disposition', 'attachment; filename=purchase-order.pdf')
    .send(pdfBuffer);
});

/**
 * Genera el PDF a partir de los datos pasados.
 * @param {{order: {number:string,date:Date,supplierName:string,notes:string}, items:Array}} data
 * @returns {Promise<Buffer>}
 */
function generatePDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 50, right: 50 } });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    // --- HEADER ---
    const logoPath = path.join(__dirname, '../data/top_values_brand_logo.jpg');
    const logoWidth = 200;
    doc.image(logoPath, (doc.page.width - logoWidth) / 2, 20, { width: logoWidth });
    doc.moveDown(4);

    // Fecha y Order ID a la derecha
    doc.fontSize(10)
      .text(`DATE: ${data.order.date.toLocaleDateString()}`, { align: 'right' })
      .text(`Order ID: ${data.order.number}`, { align: 'right' });

    doc.moveDown(2);
    doc.fontSize(12).font('Helvetica-Bold').text('ISSUED TO:');
    doc.moveDown(0.5)
      .font('Helvetica').fontSize(10)
      .text(data.order.supplierName)
      .text('Top Value Brands 1141 Holland Dr 8 Boca Raton')
      .text('FL 33487 USA');
    doc.moveDown(2);

    // --- TABLE HEADER ---
    const columnWidths = { itemNo: 120, unitPrice: 120, qty: 120, total: 120 };
    const tableWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0);
    const startX = doc.page.margins.left + ((doc.page.width - doc.page.margins.left - doc.page.margins.right - tableWidth) / 2);

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#004080');
    const headerY = doc.y;
    doc.text('ITEM NO.', startX, headerY, { width: columnWidths.itemNo });
    doc.text('UNIT PRICE', startX + columnWidths.itemNo, headerY, { width: columnWidths.unitPrice, align: 'right' });
    doc.text('QUANTITY', startX + columnWidths.itemNo + columnWidths.unitPrice, headerY, { width: columnWidths.qty, align: 'right' });
    doc.text('TOTAL', startX + columnWidths.itemNo + columnWidths.unitPrice + columnWidths.qty, headerY, { width: columnWidths.total, align: 'right' });

    const headerBottomY = headerY + 15;
    doc.moveTo(startX, headerBottomY)
      .lineTo(startX + tableWidth, headerBottomY)
      .stroke();
    doc.y = headerBottomY + 5;

    // --- AGRUPAR ITEMS ---
    const grouped = [];
    data.items.forEach(item => {
      let g = grouped.find(x => x.supplier_item_number === item.supplier_item_number);
      if (g) {
        g.quantity += item.quantity;
        g.total += item.total;
      } else {
        grouped.push({ ...item });
      }
    });

    // --- TABLE ROWS ---
    doc.font('Helvetica').fontSize(10).fillColor('black');
    const rowHeight = 20;
    let y = doc.y;

    grouped.forEach((row, i) => {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 60) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      if (i % 2 === 0) {
        doc.rect(startX, y - 2, tableWidth, rowHeight)
          .fill('#f9f9f9')
          .fillColor('black');
      }
      const itemNo = row.supplier_item_number || row.asin || row.product_id;
      // Imprimir valores con separadores de miles
      doc.text(itemNo.toString(), startX, y, { width: columnWidths.itemNo });
      doc.text(
        `$${row.unitCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        startX + columnWidths.itemNo,
        y,
        { width: columnWidths.unitPrice, align: 'right' }
      );
      doc.text(
        row.quantity.toLocaleString('en-US'),
        startX + columnWidths.itemNo + columnWidths.unitPrice,
        y,
        { width: columnWidths.qty, align: 'right' }
      );
      doc.text(
        `$${row.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        startX + columnWidths.itemNo + columnWidths.unitPrice + columnWidths.qty,
        y,
        { width: columnWidths.total, align: 'right' }
      );

      y += rowHeight;
      doc.y = y;
    });

    // --- SUBTOTAL ---
    const subTotal = grouped.reduce((sum, r) => sum + r.total, 0);
    doc.moveDown(2)
      .font('Helvetica-Bold')
      .text(
        `SUBTOTAL: $${subTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        { align: 'right' }
      );

    // --- ORDER NOTES (Markdown simple) ---
    if (data.order.notes) {
      doc.moveDown(2)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('ORDER NOTES:');
      doc.moveDown(0.5)
        .font('Helvetica')
        .fontSize(10);
      const lines = data.order.notes.split(/\r?\n/);
      lines.forEach(line => {
        if (!line.trim()) {
          doc.moveDown(0.5);
        } else if (/^#+\s/.test(line)) {
          const text = line.replace(/^#+\s/, '');
          doc.font('Helvetica-Bold').fontSize(12).text(text);
          doc.font('Helvetica').fontSize(10);
        } else if (/^-\s/.test(line)) {
          const text = line.replace(/^-+\s/, '');
          doc.text(`• ${text}`, { indent: 20 });
        } else {
          doc.text(line);
        }
      });
    }

    // --- FOOTER ---
    const footerY = doc.page.height - doc.page.margins.bottom - 40;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Thank you for your business!', 0, footerY, { align: 'center' });
    doc.text('www.topvaluebrands.com', 0, footerY + 15, { align: 'center' });

    doc.end();
  });
}



exports.fixPurchaseOrderProductsProfit = asyncHandler(async (req, res, next) => {

  // Get all PO products.
  const purchaseOrderProducts = await PurchaseOrderProduct.findAll({
    attributes: ['product_id', 'product_cost', 'profit', 'id'],
    order: [
      ['id', 'ASC']
    ]
  });
  const productsToUpdate = await TrackedProduct.findAll({
    where: {
      product_id: purchaseOrderProducts.map(p => p.product_id)
    },
    attributes: [
      'fees', 'lowest_fba_price', 'product_id'
    ],
  });

  // JOIN purchaseOrderProducts with productsToUpdate
  const purchaseOrderProductsToUpdate = purchaseOrderProducts.map(p => {
    const product = productsToUpdate.find(prod => prod.product_id === p.product_id);
    return {
      purchaseOrderProductId: p.id,
      product_id: p.product_id,
      product_cost: p.product_cost,
      profit: p.profit,
      lowest_fba_price: product.lowest_fba_price,
      fees: product.fees,
    };
  });

  // Update all purchaseOrderProducts profits to be: lowest_fba_price - (product_cost + fees)
  for (const product of purchaseOrderProductsToUpdate) {
    product.profit = parseFloat(((parseFloat(product.lowest_fba_price) || 0) - ((parseFloat(product.product_cost) || 0) + (parseFloat(product.fees) || 0))).toFixed(2));
  }

  // Update all purchaseOrderProducts
  for (const product of purchaseOrderProductsToUpdate) {
    await PurchaseOrderProduct.update({
      profit: product.profit
    }, {
      where: {
        id: product.purchaseOrderProductId
      }
    });
  }

  return res.json({
    purchaseOrderProductsToUpdate
  });

})