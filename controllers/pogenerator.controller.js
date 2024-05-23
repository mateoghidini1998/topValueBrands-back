const asyncHandler = require('../middlewares/async');
const { Product } = require('../models/')
const dotenv = require('dotenv');
const axios = require('axios')

dotenv.config({ path: './.env' });

exports.getProductsTrackedData = asyncHandler(async (req, res, next) => {
    try {
        // Obtén solo 10 productos
        const products = await Product.findAll({ limit: 10 });
        console.log('Fetched products:', products);

        // Crea un solo grupo de 10 ASINs
        const asinGroup = products.map(product => product.ASIN).join(',');
        console.log('ASIN group:', asinGroup);

        // Realiza la solicitud a la API de Keepa para el grupo de ASINs
        const keepaDataResponse = await getKeepaData(asinGroup);
        console.log('Keepa data response:', keepaDataResponse);

        // Procesa la respuesta según sea necesario
        return res.status(200).json({ success: true, data: keepaDataResponse });
    } catch (error) {
        console.error('Error fetching data:', error);
        return res.status(500).json({ success: false, message: 'Error fetching data from Keepa.' });
    }
});

const getKeepaData = async (asinGroup) => {
    const apiKey = process.env.KEEPA_API_KEY;
    const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinGroup}&stats=1`;
    console.log(url)
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