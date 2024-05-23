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
  
    let newOrdersCount = 0;
    let updatedOrdersCount = 0;
    const orders = [];
  
    try {
      for (let item of jsonData) {
        const existingOrder = await Order.findOne({ where: { amazon_order_id: item['amazon-order-id'] } });
        if (existingOrder) {
          // Update the existing order if there are changes
          const updatedFields = {};
          if(existingOrder.purchase_date !== item['purchase-date']) updatedFields.purchase_date = item['purchase-date'];
          if (existingOrder.order_status !== item['order-status']) updatedFields.order_status = item['order-status'];
          if (existingOrder.sku !== item.sku) updatedFields.sku = item.sku;
          if (existingOrder.ASIN !== item.asin) updatedFields.ASIN = item.asin;
          if (existingOrder.quantity !== item.quantity) updatedFields.quantity = item.quantity;
          if (existingOrder.currency !== item.currency) updatedFields.currency = item.currency;
          if (existingOrder.price !== item['item-price']) updatedFields.price = item['item-price'];
  
          if (Object.keys(updatedFields).length > 0) {
            await existingOrder.update(updatedFields);
            updatedOrdersCount++;
          }
        } else {
          // Create a new order if it doesn't exist
          await Order.create({
            amazon_order_id: item['amazon-order-id'],
            purchase_date: item['purchase-date'],
            order_status: item['order-status'],
            sku: item.sku,
            ASIN: item.asin,
            quantity: item.quantity,
            currency: item.currency,
            price: item['item-price'],
          });
          newOrdersCount++;
        }
        orders.push({
          amazon_order_id: item['amazon-order-id'],
          purchase_date: item['purchase-date'],
          order_status: item['order-status'],
          sku: item.sku,
          ASIN: item.asin,
          quantity: item.quantity,
          currency: item.currency,
          price: item['item-price'],
        });
      }
      return res.status(200).json({ 
        message: 'Orders processed successfully.', 
        newOrdersCount, 
        updatedOrdersCount, 
        orders 
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ errors: [{ msg: 'Error saving orders' }] });
    }
  });