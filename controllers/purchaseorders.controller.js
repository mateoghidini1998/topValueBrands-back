const asyncHandler = require('../middlewares/async');
const { Product, PurchaseOrder, PurchaseOrderProduct } = require('../models');

exports.createPurchaseOrder = asyncHandler(async (req, res, next) => {
  const { order_number, supplier_id, status, products } = req.body;

  // Check if the order number already exists
  let purchaseOrder = await PurchaseOrder.findOne({ where: { order_number } });

  if (purchaseOrder) {
    return res.status(400).json({ message: 'Purchase Order already exists' });
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
    status,
    total_price: 0,
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
        as: 'purchaseOrderProducts',
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

  const { supplier_id, products } = req.body;

  if (!purchaseOrder) {
    return res.status(404).json({ message: 'Purchase Order not found' });
  }

  const purchaseorderproducts = await getPurchaseOrderProducts(
    purchaseOrder.id
  );

  //If there are no products in the purchase order, supplier id can be updated
  if (purchaseorderproducts.length === 0) {
    await purchaseOrder.update({ supplier_id });
    return res.status(200).json({
      success: true,
      data: purchaseOrder,
    });
  }

  const existingProductIds = purchaseorderproducts.map(
    (purchaseorderproduct) => purchaseorderproduct.product_id
  );

  const newProductIds = products.map((product) => product.product_id);

  const productsToAdd = products.filter(
    (p) => !existingProductIds.includes(p.product_id)
  );

  const productsToRemove = purchaseorderproducts.filter(
    (p) => !newProductIds.includes(p.product_id)
  );

  let totalPrice = purchaseOrder.total_price;
  for (const product of productsToAdd) {
    const { product_id, unit_price, quantity } = product;
    const existingProduct = await Product.findByPk(product_id);

    if (!existingProduct) {
      return res
        .status(400)
        .json({ message: `Product ${product_id} not found` });
    }

    // Validate that the product belongs to the same supplier
    if (existingProduct.supplier_id !== purchaseOrder.supplier_id) {
      return res.status(400).json({
        message: `Product ${product_id} does not belong to supplier ${purchaseOrder.supplier_id}`,
      });
    }
    const newPurchaseOrderProduct = await PurchaseOrderProduct.create({
      purchase_order_id: purchaseOrder.id,
      product_id,
      unit_price,
      quantity,
      total_amount: unit_price * quantity,
    });

    totalPrice += newPurchaseOrderProduct.total_amount;
  }

  // Remove old products
  for (const product of productsToRemove) {
    totalPrice -= product.total_amount;
    await product.destroy();
  }

  // Update the total price of the purchase order
  await purchaseOrder.update({ total_price: totalPrice });

  const updatedPurchaseOrder = await PurchaseOrder.findByPk(purchaseOrder.id, {
    include: [
      {
        model: PurchaseOrderProduct,
        as: 'purchaseOrderProducts',
      },
    ],
  });

  return res.status(200).json({
    success: true,
    data: updatedPurchaseOrder,
  });
});

exports.getPurchaseOrders = asyncHandler(async (req, res, next) => {
  const purchaseOrders = await PurchaseOrder.findAll({
    include: [
      {
        model: PurchaseOrderProduct,
        as: 'purchaseOrderProducts',
      },
    ],
  });

  return res.status(200).json({
    success: true,
    data: purchaseOrders,
  });
});

exports.getPurchaseOrderById = asyncHandler(async (req, res, next) => {
  const purchaseOrderId = req.params.id;

  const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, {
    include: [
      {
        model: PurchaseOrderProduct,
        as: 'purchaseOrderProducts',
      },
    ],
  });
  return res.status(200).json({
    success: true,
    data: purchaseOrder,
  });
});

const createPurchaseOrderProducts = async (purchaseOrderId, products) => {
  let totalPrice = 0;

  for (const product of products) {
    const { product_id, unit_price, quantity } = product;

    const purchaseOrderProduct = await PurchaseOrderProduct.create({
      purchase_order_id: purchaseOrderId,
      product_id,
      unit_price,
      quantity,
      total_amount: unit_price * quantity,
    });

    totalPrice += purchaseOrderProduct.total_amount;
  }

  return totalPrice;
};

const getPurchaseOrderProducts = async (purchaseOrderId) => {
  const purchaseOrderProducts = await PurchaseOrderProduct.findAll({
    where: { purchase_order_id: purchaseOrderId },
  });

  return purchaseOrderProducts;
};
