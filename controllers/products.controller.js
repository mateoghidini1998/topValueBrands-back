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


exports.getAllInventorySummary = asyncHandler(async (req, res) => {
    try {
        let nextToken = null;

        let allInventorySummaries = [];
        let requestCount = 0; // Contador de solicitudes

        let fechaActual = new Date();

        // Resta 18 meses a la fecha actual
        fechaActual.setMonth(fechaActual.getMonth() - 18);

        // Formatea la fecha resultante en ISO8601
        let fecha18MesesAtras = fechaActual.toISOString();

        do {
            // Parámetros de consulta
            const queryParams = {
                granularityType: process.env.GRANULARITY_TYPE,
                granularityId: process.env.GRANULARITY_US_ID,
                marketplaceIds: process.env.MARKETPLACE_US_ID,
                details: true,
                includedInactive: false,
                nextToken: nextToken || '',
                startDateTime: fecha18MesesAtras,
                // sellerSkus:'5N-YZ9X-ZK1S'
            };

            // URL de la API con los parámetros de consulta
            const url = 'https://sellingpartnerapi-na.amazon.com/fba/inventory/v1/summaries';

            // Configuración de la solicitud
            const config = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
                    'x-amz-access-token': req.headers['x-amz-access-token']
                },
                params: queryParams
            };

            // Hacer la solicitud a la API de Amazon SP-API
            const response = await axios.get(url, config);

            // Añade los resúmenes de inventario de la página actual al arreglo total
            allInventorySummaries = allInventorySummaries.concat(response.data.payload.inventorySummaries);
            // allInventorySummaries = [...response.data.payload.inventorySummaries]

            // Verifica si hay un nextToken en la respuesta
            nextToken = response.data.pagination ? response.data.pagination.nextToken : false;

            // Incrementa el contador de solicitudes
            requestCount++;



            // Aplica un retraso de 3.5 segundos después de 2 solicitudes
            if (requestCount % 5 === 0) {
                console.log('Aplicando retraso de 3.5 segundos...');
                console.log('Solicitudes realizadas:', requestCount);
                await new Promise(resolve => setTimeout(resolve, 3500));
            }

            if (!nextToken) {
                console.log('Guardando productos en la base de datos...');
                await saveProductsToDatabase(allInventorySummaries);
                console.log('Saved data successfully');
                allInventorySummaries = [];
                console.log('Reset allInventorySummaries');
                console.log(allInventorySummaries);
            }

            console.log("NextToken:", nextToken);
            console.log(response.data);

        } while (nextToken);


        return res.status(200).json({ allInventorySummaries, cantidad: allInventorySummaries.length });
    } catch (error) {
        console.error({ msg: error.message });
    }
});

// Función auxiliar para guardar productos en la base de datos
async function saveProductsToDatabase(inventorySummaries) {
    const products = await Promise.all(inventorySummaries.map(product => {
        return Product.create({
            ASIN: product.asin,
            product_name: product.productName,
            seller_sku: product.sellerSku,
            FBA_available_inventory: product.inventoryDetails.fulfillableQuantity,
            FC_transfer: product.inventoryDetails.reservedQuantity.pendingTransshipmentQuantity,
            Inbound_to_FBA: product.inventoryDetails.inboundShippedQuantity
        });
    }));
    return products;
}


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


