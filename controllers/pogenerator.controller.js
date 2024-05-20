const asyncHandler = require('../middlewares/async');
const { Product } = require('../models/')
const dotenv = require('dotenv');
const axios = require('axios')

dotenv.config({ path: './.env' });

exports.getProductsTrackedData = asyncHandler(async (req, res, next) => {
    const products = await Product.findAll();
    
    const asins = products.slice(0, 1).map(product => product.ASIN);

    const keepaDataPromises = asins.map(getKeepaData);
    const keepaDataResults = await Promise.all(keepaDataPromises);

    const validKeepaData = keepaDataResults.filter(data => data !== null)

    return res.status(200).json({ 
        success: true,
        suggestedLowerPrice: validKeepaData[0].products[0].suggestedLowerPrice,
        salesRanks: validKeepaData[0].products[0].salesRanks,
        salesRankReferenceHistory: validKeepaData[0].products[0].salesRankReferenceHistory
    })

});

const getKeepaData = async (asin) => {
    const apiKey = process.env.KEEPA_API_KEY

    const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asin}&stats=1`

    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`Error fetching data for ASIN ${asin}: `, error);
        return null;
    }
}