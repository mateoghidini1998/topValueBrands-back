const express = require('express');
const asyncHandler = require('../middlewares/async')
const axios = require('axios');
const dotenv = require('dotenv');
const { Product } = require('../models');

dotenv.config({
    path: './.env'
})

//Function to getInventorySummary

exports.getInventorySummary = asyncHandler(async (req, res) => {
    try {
        const url = `${'https://sellingpartnerapi-na.amazon.com/fba/inventory/v1/summaries'}?granularityType=${process.env.GRANULARITY_TYPE}&granularityId=${process.env.GRANULARITY_US_ID}&marketplaceIds=${process.env.MARKETPLACE_US_ID}&details=true`;
        const response = await axios.get(url,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
                    "x-amz-access-token": req.headers['x-amz-access-token']
                }
            });
        const inventorySummaries = response.data;

        /* const products = await Promise.all(inventorySummaries.map(product => {
            return Product.create({
                ASIN: product.asin,
                product_name: product.productName,
                seller_sku: product.sellerSku,
                FBA_available_inventory: product.inventoryDetails.fulfillableQuantity,
                FC_transfer: product.inventoryDetails.pendingTransshipmentQuantity,
                Inbound_to_FBA: product.inventoryDetails.inboundShippedQuantity
            });
        })); */

        res.status(200).json(inventorySummaries);
    } catch (error) {;
        console.error({msg: error.message})
    }
});





