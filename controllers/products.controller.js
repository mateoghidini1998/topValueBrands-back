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
        const url = `${'https://sellingpartnerapi-na.amazon.com/fba/inventory/v1/summaries'}?granularityType=${process.env.GRANULARITY_TYPE}&granularityId=${process.env.GRANULARITY_US_ID}&marketplaceIds=${process.env.MARKETPLACE_US_ID}&details=true`;


        const response = await axios.get(url,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
                    "x-amz-access-token": req.headers['x-amz-access-token']
                }
            });

        const inventory = response;

        res.status(200).json(inventory.data);
    } catch (error) {;
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




