const { Product } = require('../models');
const axios = require('axios');
const asyncHandler = require('../middlewares/async');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

exports.getProductsTrackedData = asyncHandler(async (req, res, next) => {
    try {
        // Obtén todos los productos que necesitas (puedes ajustar el límite según tus necesidades)
        const products = await Product.findAll();
        console.log('Fetched products:', products);

        // Divide los productos en grupos de 20 ASINs
        const asinGroups = [];
        for (let i = 0; i < products.length; i += 20) {
            const group = products.slice(i, i + 20).map(product => product.ASIN).join(',');
            asinGroups.push(group);
        }
        console.log('ASIN groups:', asinGroups);

        // Realiza las solicitudes a la API de Keepa para cada grupo de ASINs
        const keepaResponses = [];
        for (const asinGroup of asinGroups) {
            const keepaDataResponse = await getKeepaData(asinGroup);
            console.log('Keepa data response:', keepaDataResponse);
            keepaResponses.push(keepaDataResponse);

            // Espera 1.5 minutos (90,000 ms) antes de hacer la siguiente solicitud
            await new Promise(resolve => setTimeout(resolve, 65000));
        }

        // Procesa todas las respuestas de Keepa para formar el JSON final
        const processedData = keepaResponses.flatMap(response => response.products.map(product => {
            return {
                ASIN: product.asin,
                currentSalesRank: product.stats.current[3],
                avg30: product.stats.avg30[3],
                avg90: product.stats.avg90[3]
            };
        }));

        return res.status(200).json({ success: true, data: processedData });
    } catch (error) {
        console.error('Error fetching data:', error);
        return res.status(500).json({ success: false, message: 'Error fetching data from Keepa.' });
    }
});

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