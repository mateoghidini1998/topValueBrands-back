const asyncHandler = require('../middlewares/async');
const { Product, PurchaseOrder, PurchaseOrderProduct, Supplier, TrackedProduct, PurchaseOrderStatus } = require('../models');
const path = require('path');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { where } = require('sequelize');

exports.createPurchaseOrder = asyncHandler(async (req, res, next) => {
  const { order_number, supplier_id, purchase_order_status_id, products, notes } = req.body;

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
      { unit_price, quantity_purchased: quantity, total_amount: totalAmount },
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
  if (purchaseOrder.purchase_order_status_id === 1) {
    await purchaseOrder.update({ purchase_order_status_id: 2 });
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
    where: { is_active: true },
    include: [
      {
        model: PurchaseOrderProduct,
        as: 'purchaseOrderProducts',
      },
      {
        model: PurchaseOrderStatus,
        as: 'purchaseOrderStatus', // Incluido el modelo con alias
        attributes: ['description'], // Solo trae el campo 'description'
      },
    ],
  });

  // Obtener supplier_name para cada purchase order
  await Promise.all(
    purchaseOrders.map(async (purchaseOrder) => {
      const purchaseSupplier = await Supplier.findByPk(purchaseOrder.supplier_id);
      purchaseOrder.setDataValue('supplier_name', purchaseSupplier.supplier_name);

      // Utiliza la asociación ya existente para obtener la descripción
      const statusDescription = purchaseOrder.purchaseOrderStatus?.description;
      purchaseOrder.setDataValue('status', (statusDescription || 'Unknown').toUpperCase());
    })
  );

  // Obtener product_name para cada purchase order product
  await Promise.all(
    purchaseOrders.map(async (purchaseOrder) => {
      await Promise.all(
        purchaseOrder.purchaseOrderProducts.map(async (purchaseOrderProduct) => {
          const purchaseProduct = await Product.findByPk(purchaseOrderProduct.product_id);
          purchaseOrderProduct.setDataValue('product_name', purchaseProduct.product_name);
        })
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
      const [trackedProductsOfTheOrder, productsOfTheOrder] = await Promise.all([
        TrackedProduct.findAll({ where: { product_id: productIds } }),
        Product.findAll({ where: { id: productIds } }),
      ]);

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
      purchaseOrder.setDataValue('average_roi', totalRoi / roiArr.length);
    })
  );

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
      quantity_purchased: quantity,
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

  await purchaseOrder.update({ purchase_order_status_id: 1 });

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

  await purchaseOrder.update({ purchase_order_status_id: 3 });

  return res.status(200).json({
    success: true,
    data: purchaseOrder
  });
});

exports.restartPurchaseOrder = asyncHandler(async (req, res, next) => {
  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id);
  if (!purchaseOrder) {
    return res.status(404).json({ message: 'Purchase Order not found' });
  }

  await purchaseOrder.update({ purchase_order_status_id: 2 });

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

exports.deletePurchaseOrder = asyncHandler(async (req, res, next) => {

  // check if the user is admin
  // if (req.user.role !== 'admin') {
  //   return res.status(401).json({ message: 'Unauthorized' });
  // }

  const purchaseOrder = await PurchaseOrder.findByPk(req.params.id);
  if (!purchaseOrder) {
    return res.status(404).json({ message: 'Purchase Order not found' });
  }

  await purchaseOrder.update({ is_active: false });
  return res.status(200).json({
    success: true,
    data: purchaseOrder
  });

});

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
  const totalAmount = purchaseOrderProducts.reduce((total, product) => Number(total) + Number(product.total_amount), 0);

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
      quantity_purchased: product.quantity,
      total_amount: product.total_amount,
    };
  }));

  // Filtrar productos nulos (en caso de que no se encuentren algunos productos)
  const filteredProducts = products.filter(product => product !== null);

  const supplierName = await Supplier.findOne({ where: { id: purchaseOrder.supplier_id } });
  if (!supplierName) {
    return res.status(404).json({ message: 'Supplier not found' });
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

  console.log(pdfData);

  const pdfBuffer = await generatePDF(pdfData);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=purchase-order.pdf');
  res.send(pdfBuffer);
});

const generatePDF = (data) => {
  console.log(data);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    let buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      let pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    const logoPath = path.join(__dirname, '../data/top_values_brand_logo.jpg');

    doc.image(logoPath, 200, 10, { width: 200, align: 'center' });
    doc.moveDown(8);
    doc.text(`DATE: ${new Date().toLocaleDateString()}`);
    doc.moveDown(1);
    doc.fontSize(12).text('ISSUED TO:', { bold: true });
    doc.moveDown(1);
    doc.text(`${data.purchaseOrder.supplier_name}`);
    doc.text('Top Value Brands 1141 Holland Dr 8 Boca Raton');
    doc.text('FL 33487 USA');
    doc.moveDown();
    doc.fontSize(12).text(`Order ID: ${data.purchaseOrder.order_number}`);
    doc.moveDown(3);

    const TABLE_LEFT = 70;
    const TABLE_TOP = 350;
    const itemDistanceY = 20;

    // Table Headers
    doc.fillColor('blue').fontSize(12).text('ITEM NO.', TABLE_LEFT, TABLE_TOP, { extraBold: true });
    // doc.text('ASIN', TABLE_LEFT + 70, TABLE_TOP, { bold: true });
    doc.text('UNIT PRICE', TABLE_LEFT + 180, TABLE_TOP, { bold: true });
    doc.text('QUANTITY', TABLE_LEFT + 300, TABLE_TOP, { bold: true });
    doc.text('TOTAL', TABLE_LEFT + 400, TABLE_TOP, { bold: true });

    let position = TABLE_TOP + itemDistanceY;
    data.products.forEach((product, index) => {
      // Background color for each row
      if (index % 2 === 0) {
        doc.rect(TABLE_LEFT - 10, position - 5, 500, itemDistanceY).fill('#f2f2f2').stroke();
      }
      doc.fillColor('black');
      doc.text(product.product_id, TABLE_LEFT, position);
      // doc.text(product.ASIN, TABLE_LEFT + 70, position);
      doc.text('$' + Number(product.unit_price).toFixed(2), TABLE_LEFT + 180, position);
      doc.text(product.quantity, TABLE_LEFT + 300, position);
      doc.text('$' + Number(product.total_amount).toFixed(2), TABLE_LEFT + 400, position);
      position += itemDistanceY;
    });

    // Subtotal and Total
    doc.moveDown(3);
    doc.fillColor('black').text(`SUBTOTAL:   $ ${Number(data.purchaseOrder.total_amount).toFixed(2)}`, TABLE_LEFT);

    // Order Notes
    doc.moveDown(2);
    doc.text('ORDER NOTES:', TABLE_LEFT);
    doc.moveDown();
    doc.text(data.purchaseOrder.notes);

    doc.text('Thank you for your business!', { bold: true, align: "center" }, doc.page.height - 150);
    doc.text('www.topvaluebrands.com', { bold: true, align: "center" });

    doc.end();
  });
};
