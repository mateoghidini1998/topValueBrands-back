const { Product, TrackedProduct } = require('../models');
const axios = require('axios');
const asyncHandler = require('../middlewares/async');
const { generateOrderReport } = require('../utils/utils');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const getProductsTrackedData = async (req, res, next) => {
    try {
      // Obtener todos los productos necesarios y limitar a los primeros 100 productos
      const products = await Product.findAll();
      console.log('Fetched products:', products);
  
      // Dividir los productos en grupos de 20 ASINs
      const asinGroups = [];
      for (let i = 0; i < products.length; i += 20) {
        const group = products.slice(i, i + 20).map(product => product.ASIN).join(',');
        asinGroups.push(group);
      }
      console.log('ASIN groups:', asinGroups);
  
      // Realizar las solicitudes a la API de Keepa para cada grupo de ASINs
      const keepaResponses = [];
      for (const asinGroup of asinGroups) {
        const keepaDataResponse = await getKeepaData(asinGroup);
        console.log('Keepa data response:', keepaDataResponse);
        keepaResponses.push(keepaDataResponse);
  
        // Esperar 1.5 minutos (90,000 ms) antes de hacer la siguiente solicitud
        await new Promise(resolve => setTimeout(resolve, 65000));
      }
  
      // Procesar todas las respuestas de Keepa para formar el JSON final
      const processedData = keepaResponses.flatMap(response => response.products.map(product => {
        return {
          ASIN: product.asin,
          currentSalesRank: product.stats.current[3],
          avg30: product.stats.avg30[3],
          avg90: product.stats.avg90[3]
        };
      }));
  
      return processedData;
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error('Error fetching data from Keepa.');
    }
  };
  

const getKeepaData = async (asinGroup) => {
    const apiKey = process.env.KEEPA_API_KEY;
    const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1`;
    console.log(url);
    try {
        console.log('Fetching data from Keepa for ASIN group:', asinGroup);
        const response = await axios.get(url);
        console.log('Response from Keepa:', response.data);
        if (!response.data) {
            throw new Error('No data received from Keepa');
        }
        return response.data;
    } catch (error) {
        console.error('Error fetching data for ASIN group:', asinGroup, error.response ? error.response.data : error.message);
        throw error;
    }
};


const saveOrders = asyncHandler(async (req, res, next) => {
    const jsonData = await generateOrderReport(req, res, next);
  
    if (!jsonData) {
      throw new Error('Failed to retrieve orders');
    }
  
    // Filtrar pedidos por estado = Enviado y fecha dentro de los últimos 30 días
    const filteredOrders = jsonData.filter(item => item['order-status'] === 'Shipped' && new Date() - new Date(item['purchase-date']) <= 30 * 24 * 60 * 60 * 1000);
  
    // Acumular cantidad por SKU y almacenar ASIN
    const skuQuantities = {};
    for (let item of filteredOrders) {
      const { sku, quantity, asin } = item;
  
      const qty = parseInt(quantity, 10); // Convertir cantidad a número
      if (!skuQuantities[sku]) {
        skuQuantities[sku] = { quantity: qty, asin };
      } else {
        skuQuantities[sku].quantity += qty;
      }
    }
  
    // Generar JSON con SKU, ASIN, cantidad y velocidad
    const finalJson = Object.entries(skuQuantities).map(([sku, { quantity, asin }]) => ({
      sku,
      asin,
      quantity,
      velocity: quantity / 30
    }));
  
    return finalJson;
  });
  

  exports.generateTrackedProductsData = asyncHandler(async (req, res, next) => {
    try {
      // Obtener datos de ambas APIs
      const [orderData, keepaData] = await Promise.all([
        saveOrders(req, res, next),
        getProductsTrackedData(req, res, next)
      ]);
  
      const orderItems = orderData;
      const keepaItems = keepaData;
  
      // Combinar datos por ASIN
      const combinedData = keepaItems.map(keepaItem => {
        const orderItem = orderItems.find(o => o.asin === keepaItem.ASIN) || {};
        const unitsSold = orderItem.quantity || 0;
        const productVelocity = orderItem.velocity || 0;
  
        return {
          ASIN: keepaItem.ASIN,
          seller_sku: orderItem.sku || '',
          current_rank: keepaItem.currentSalesRank || null,
          thirty_days_rank: keepaItem.avg30 || null,
          ninety_days_rank: keepaItem.avg90 || null,
          units_sold: unitsSold,
          product_velocity: productVelocity
        };
      });
  
      // Guardar datos en la base de datos
      await TrackedProduct.bulkCreate(combinedData);
  
      return res.status(200).json({
        message: 'Data combined and saved successfully.',
        data: combinedData
      });
    } catch (error) {
      console.error('Error combining and saving data:', error);
      return res.status(500).json({ success: false, message: 'Error combining and saving data.' });
    }
  });
  