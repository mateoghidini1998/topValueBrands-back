const express = require('express');
const asyncHandler = require('../middlewares/async');
const { getReportById, parseReportToJSON } = require('../utils/pogenerator.utils')
const { Order } = require('../models/');
const axios = require('axios');
const zlib = require('zlib');

const generateReport = asyncHandler(async (req, res, next) => {
    const reportData = await getReportById(req, res, next);
  
    if (!reportData || !reportData.reportDocumentId) {
      throw new Error('Report data is invalid or missing reportDocumentId');
    }
  
    const documentId = reportData.reportDocumentId;
  
    const response = await axios.get(`${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': req.headers['x-amz-access-token']
      }
    });
  
    if (!response.data || !response.data.url) {
      throw new Error('Failed to retrieve document URL from response');
    }
  
    const documentUrl = response.data.url;
    const compressionAlgorithm = response.data.compressionAlgorithm;
  
    // Obtener el contenido del documento desde la URL
    const documentResponse = await axios.get(documentUrl, { responseType: 'arraybuffer' });
  
    // Descomprimir y decodificar los datos si es necesario
    let decodedData;
    if (compressionAlgorithm === 'GZIP') {
      decodedData = zlib.gunzipSync(Buffer.from(documentResponse.data));
    } else {
      decodedData = Buffer.from(documentResponse.data);
    }
  
    // Convertir los datos decodificados a string
    const dataString = decodedData.toString('utf-8');
  
    // Verificar que dataString no sea nulo ni indefinido antes de devolverlo
    if (!dataString) {
      throw new Error('Failed to decode report data');
    }
  
    const jsonData = parseReportToJSON(dataString);
  
    return jsonData;

});

exports.saveOrders = asyncHandler(async (req, res, next) => {
  const jsonData = await generateReport(req, res, next);

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
