const asyncHandler = require('../middlewares/async');
const { Product, PurchaseOrder, PurchaseOrderProduct, Supplier } = require('../models');
const path = require('path');
const PDFDocument = require('pdfkit');
const fs = require('fs');

exports.createPurchaseOrder = asyncHandler(async (req, res, next) => {
  const { order_number, supplier_id, status, products, notes } = req.body;

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
    status: 'Pending',
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

  const { supplier_id, products, order_number, notes } = req.body;

  if (!purchaseOrder) {
    return res.status(404).json({ message: 'Purchase Order not found' });
  }

  const purchaseorderproducts = await getPurchaseOrderProducts(
    purchaseOrder.id
  );

  //If there are no products in the purchase order, supplier id can be updated
  // if (purchaseorderproducts.length === 0) {
  //   await purchaseOrder.update({ supplier_id });
  //   return res.status(200).json({
  //     success: true,
  //     data: purchaseOrder,
  //   });
  // }

  // const existingProductIds = purchaseorderproducts.map(
  //   (purchaseorderproduct) => purchaseorderproduct.product_id
  // );

  // const newProductIds = products.map((product) => product.product_id);

  // const productsToAdd = products.filter(
  //   (p) => !existingProductIds.includes(p.product_id)
  // );

  // const productsToRemove = purchaseorderproducts.filter(
  //   (p) => !newProductIds.includes(p.product_id)
  // );


  //  Update the purchaseorderproducts quantity and unit_price
  for (const product of products) {
    const { product_id, unit_price, quantity } = product;
    const totalAmount = unit_price * quantity;
    await PurchaseOrderProduct.update(
      { unit_price, quantity, total_amount: totalAmount },
      {
        where: {
          purchase_order_id: purchaseOrder.id,
          product_id,
        },
      }
    );
  }

  const totalPrice = products.reduce((acc, product) => {
    return acc + product.unit_price * product.quantity;
  }, 0);

  // let totalPrice = purchaseOrder.total_price;
  // for (const product of productsToAdd) {
  //   const { product_id, unit_price, quantity } = product;
  //   const existingProduct = await Product.findByPk(product_id);

  //   if (!existingProduct) {
  //     return res
  //       .status(400)
  //       .json({ message: `Product ${product_id} not found` });
  //   }

  //   // Validate that the product belongs to the same supplier
  //   if (existingProduct.supplier_id !== purchaseOrder.supplier_id) {
  //     return res.status(400).json({
  //       message: `Product ${product_id} does not belong to supplier ${purchaseOrder.supplier_id}`,
  //     });
  //   }
  //   const newPurchaseOrderProduct = await PurchaseOrderProduct.create({
  //     purchase_order_id: purchaseOrder.id,
  //     product_id,
  //     unit_price,
  //     quantity,
  //     total_amount: unit_price * quantity,
  //   });

  //   totalPrice += newPurchaseOrderProduct.total_amount;
  // }

  // Remove old products
  // for (const product of productsToRemove) {
  //   totalPrice -= product.total_amount;
  //   await product.destroy();
  // }

  // if the previous purchase order status was rejected, change it to pending
  if (purchaseOrder.status === 'Rejected') {
    await purchaseOrder.update({ status: 'Pending' });
  }

  // Update the total price of the purchase order
  await purchaseOrder.update({ total_price: totalPrice, notes: notes });

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

  // get the supplier_name for each purchase order
  for (const purchaseOrder of purchaseOrders) {
    const purchaseSupplier = await Supplier.findByPk(purchaseOrder.supplier_id);
    purchaseOrder.setDataValue('supplier_name', purchaseSupplier.supplier_name);
  }

  // get the product_name for each purchase order product
  for (const purchaseOrder of purchaseOrders) {
    for (const purchaseOrderProduct of purchaseOrder.purchaseOrderProducts) {
      const purchaseProduct = await Product.findByPk(
        purchaseOrderProduct.product_id
      );
      purchaseOrderProduct.setDataValue(
        'product_name',
        purchaseProduct.product_name
      );
    }
  }

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

exports.rejectPurchaseOrder = asyncHandler(async (req, res, next) => {

  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id);
  if (!purchaseOrder) {
    return res.status(404).json({ message: 'Purchase Order not found' });
  }

  await purchaseOrder.update({ status: 'Rejected' });

  return res.status(200).json({
    success: true,
    data: purchaseOrder
  });
});

exports.approvePurchaseOrder = asyncHandler(async (req, res, next) => {
  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id);
  if (!purchaseOrder) {
    return res.status(404).json({ message: 'Purchase Order not found' });
  }

  await purchaseOrder.update({ status: 'Approved' });

  return res.status(200).json({
    success: true,
    data: purchaseOrder
  });
});

const getPurchaseOrderProducts = async (purchaseOrderId) => {
  const purchaseOrderProducts = await PurchaseOrderProduct.findAll({
    where: { purchase_order_id: purchaseOrderId },
  });

  for (const product of purchaseOrderProducts) {
    const productData = await Product.findOne({ where: { id: product.product_id } });
    product.setDataValue('product_name', productData.product_name);
  }

  return purchaseOrderProducts;
};

// Método para descargar la orden de compra
// Método para descargar la orden de compra
exports.downloadPurchaseOrder = asyncHandler(async (req, res, next) => {
  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id, {
    include: [
      {
        model: PurchaseOrderProduct,
        as: 'purchaseOrderProducts',
      },
    ],
  });
  if (!purchaseOrder) {
    return res.status(404).json({ message: 'Purchase Order not found' });
  }

  const purchaseOrderProducts = purchaseOrder.purchaseOrderProducts;
  const totalPrice = purchaseOrder.total_price;
  const totalQuantity = purchaseOrderProducts.reduce((total, product) => total + product.quantity, 0);
  const totalAmount = purchaseOrderProducts.reduce((total, product) => total + product.total_amount, 0);

  // Obtener los nombres de los productos de forma asíncrona
  const products = await Promise.all(purchaseOrderProducts.map(async (product) => {
    const productData = await Product.findOne({ where: { id: product.product_id } });
    if (!productData) {
      return null;
    }

    return {
      ASIN: productData.ASIN,
      product_id: product.product_id,
      unit_price: product.unit_price,
      quantity: product.quantity,
      total_amount: product.total_amount,
    };
  }));

  // Filtrar productos nulos (en caso de que no se encuentren algunos productos)
  const filteredProducts = products.filter(product => product !== null);

  const pdfData = {
    purchaseOrder: {
      id: purchaseOrder.id,
      total_price: totalPrice,
      total_quantity: totalQuantity,
      total_amount: totalAmount,
    },
    products: filteredProducts,
  };

  console.log(pdfData);

  const pdfBuffer = await generatePDF(pdfData);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=purchase-order.pdf');
  res.send(pdfBuffer);
});


// Método para generar el PDF
const generatePDF = (data) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    let buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      let pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    // Cabecera del documento con imagen
    const logoPath = path.join(__dirname, '../data/top_values_brand_logo.jpg');
    doc.image(logoPath, {
      fit: [100, 100],
      align: 'center',
      valign: 'center'
    });

    doc.moveDown();
    doc.fontSize(20).text('Purchase Order', { align: 'center' });
    doc.moveDown();

    // Información de emisión
    doc.fontSize(12).text('ISSUED TO:', { bold: true });
    doc.text('Central Pet Distribution (SUPPLIER NAME)');
    doc.text('11316 46TH STREET N.');
    doc.text('TAMPA FL 33617');
    doc.moveDown();

    doc.text(`DATE: ${new Date().toLocaleDateString()}`);
    doc.text(`PO NUMBER: ${data.purchaseOrder.id}`);
    doc.moveDown();

    // Información de la orden de compra
    doc.fontSize(12).text(`Order ID: ${data.purchaseOrder.id}`);
    doc.text(`Total Price: $${data.purchaseOrder.total_price}`);
    doc.text(`Total Quantity: ${data.purchaseOrder.total_quantity}`);
    doc.text(`Total Amount: $${data.purchaseOrder.total_amount}`);
    doc.moveDown();

    // Información de los productos
    doc.fontSize(14).text('Products', { underline: true });
    doc.moveDown();

    // Tabla de productos
    const tableTop = 250;
    const itemCodeX = 50;
    const descriptionX = 100;
    const quantityX = 300;
    const unitPriceX = 350;
    const totalX = 400;

    doc.fontSize(10).text('ITEM NO.', itemCodeX, tableTop, { bold: true });
    doc.text('DESCRIPTION', descriptionX, tableTop, { bold: true });
    doc.text('UNIT PRICE', unitPriceX, tableTop, { bold: true });
    doc.text('QTY', quantityX, tableTop, { bold: true });
    doc.text('TOTAL', totalX, tableTop, { bold: true });

    let position = tableTop + 20;
    data.products.forEach((product, index) => {
      doc.text(index + 1, itemCodeX, position);
      doc.text(product.product_name, descriptionX, position);
      doc.text(`$${product.unit_price.toFixed(2)}`, unitPriceX, position);
      doc.text(product.quantity, quantityX, position);
      doc.text(`$${product.total_amount.toFixed(2)}`, totalX, position);
      position += 20;
    });

    // Subtotal y total
    position += 20;
    doc.text(`SUBTOTAL: $${data.purchaseOrder.total_amount.toFixed(2)}`, totalX, position);
    position += 20;
    doc.text(`TOTAL: $${data.purchaseOrder.total_amount.toFixed(2)}`, totalX, position);
    position += 20;

    // Notas de la orden
    doc.moveDown();
    doc.text('ORDER NOTES:', { bold: true });
    doc.text('Thank you for your business!');
    doc.text('www.topvaluebrands.com');

    doc.end();
  });
};
