const express = require('express');
const asyncHandler = require('../middlewares/async');
const { generateOrderReport } = require('../utils/utils');

exports.saveOrders = asyncHandler(async (req, res, next) => {
  const jsonData = await generateOrderReport(req, res, next);

  if (!jsonData) {
    return res.status(404).json({ errors: [{ msg: 'Failed to retrieve orders' }] });
  }

  // Filter orders by status = Shipped and data is in between the past 30 days
  const filteredOrders = jsonData.filter(item => item['order-status'] === 'Shipped' && new Date() - new Date(item['purchase-date']) <= 30 * 24 * 60 * 60 * 1000);

  // Accumulate quantity by sku
  const skuQuantities = {};
  for (let item of filteredOrders) {
    const sku = item.sku;
    const quantity = parseInt(item.quantity, 10); // Convert quantity to a number
    if (!skuQuantities[sku]) {
      skuQuantities[sku] = quantity;
    } else {
      skuQuantities[sku] += quantity;
    }
  }

  // Generate json with sku and quantity
  const finalJson = Object.entries(skuQuantities).map(([sku, quantity]) => ({
    sku,
    quantity,
    velocity: quantity / 30
  }));

  return res.status(200).json({ 
    message: 'Orders processed successfully.',
    skuQuantities: finalJson
  });
});
