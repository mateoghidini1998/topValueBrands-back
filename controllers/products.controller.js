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
        const inventorySummaries = response.data.payload.inventorySummaries;
        // console.log(inventorySummaries);

        // const products = await Promise.all(inventorySummaries.map(product => {
        //     return Product.create({
        //         ASIN: product.asin,
        //         product_name: product.productName,
        //         seller_sku: product.sellerSku,
        //         FBA_available_inventory: product.inventoryDetails.fulfillableQuantity,
        //         FC_transfer: product.inventoryDetails.pendingTransshipmentQuantity,
        //         Inbound_to_FBA: product.inventoryDetails.inboundShippedQuantity
        //     });
        // }));

        res.status(200).json(inventorySummaries);
    } catch (error) {
        console.error({ msg: error.message })
    }
});

//Function getAllInventorySummary -> At the moment we fetch up to 3 pages, to avoid overloading the API (Error 429);
exports.getAllInventorySummary = asyncHandler(async (req, res) => {
    try {
        let nextToken = null;
        let allInventorySummaries = [];
        let i = 0;

        do {
            const url = `${'https://sellingpartnerapi-na.amazon.com/fba/inventory/v1/summaries'}?granularityType=${process.env.GRANULARITY_TYPE}&granularityId=${process.env.GRANULARITY_US_ID}&marketplaceIds=${process.env.MARKETPLACE_US_ID}&details=true${nextToken ? `&nextToken=${nextToken}` : ''}`;
            const response = await axios.get(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
                    "x-amz-access-token": req.headers['x-amz-access-token']
                }
            });

            // Añade los resúmenes de inventario de la página actual al arreglo total
            allInventorySummaries = allInventorySummaries.concat(response.data.payload.inventorySummaries);

            // Verifica si hay un nextToken en la respuesta
            nextToken = response.data.pagination && response.data.pagination.nextToken;
            i++;
        } while (nextToken && i <= 3);

        const products = await Promise.all(allInventorySummaries.map(product => {
            return Product.create({
                ASIN: product.asin,
                product_name: product.productName,
                seller_sku: product.sellerSku,
                FBA_available_inventory: product.inventoryDetails.fulfillableQuantity,
                FC_transfer: product.inventoryDetails.pendingTransshipmentQuantity,
                Inbound_to_FBA: product.inventoryDetails.inboundShippedQuantity
            });
        }));

        res.status(200).json(allInventorySummaries);
    } catch (error) {
        console.error({ msg: error.message });
    }
});

// Create a function to Update the products
exports.addExtraInfoToProduct = asyncHandler(async (req, res) => {
    try {
        // get the product by ASIN
        const product = await Product.findOne({ where: { ASIN: req.body.ASIN } });
        // add the supplier info to the product
        product.supplier_name = req.body.supplier_name;
        product.supplier_item_number = req.body.supplier_item_number;
        product.product_cost = req.body.product_cost;
        product.pack_type = req.body.pack_type;
        // save the product
        await product.save();
        res.status(200).json(product);
    } catch (error) {
        console.error({ msg: error.message })
    }
})

