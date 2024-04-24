const express = require('express');
const asyncHandler = require('../middlewares/async')
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({
    path: './.env'
})

//Function to getInventorySummary

exports.getInventorySummary = asyncHandler(async (req, res) => {
    try {
        // Construir la URL de la solicitud con los parámetros
        const url = `${'https://sellingpartnerapi-na.amazon.com/fba/inventory/v1/summaries'}?granularityType=${process.env.GRANULARITY_TYPE}&granularityId=${process.env.GRANULARITY_US_ID}&marketplaceIds=${process.env.MARKETPLACE_US_ID}`;

        // Realizar la solicitud
        const response = await axios.get(url,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
                    "x-amz-access-token": req.headers['x-amz-access-token']
                }
            });
        // Extraer datos de la respuesta
        const inventory = response;

        // Imprimir inventario en consola
        console.log(inventory);

        // Responder con el inventario
        res.status(200).json(inventory.data);
    } catch (error) {
        // Manejar errores
        // console.error(error);
        res.status(403).json({ error: 'Forbidden' });
    }
});

exports.getToken = asyncHandler(async (req, res) => {
    try {
        const response = await axios.post(`${process.env.AMZ_ENDPOINT}`, {
            'grant_type': 'refresh_token',
            'refresh_token': process.env.REFRESH_TOKEN,
            'client_id': process.env.CLIENT_ID,
            'client_secret': process.env.CLIENT_SECRET
        });

        const accessToken = response.data;
        console.log(accessToken);
        res.status(200).json({ accessToken });

    } catch (error) {
        console.error(error);
    }
});




