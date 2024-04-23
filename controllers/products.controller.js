const express = require('express');
const asyncHandler = require('../middlewares/async')
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({
    path: './.env'
})

exports.getToken = asyncHandler(async (req, res) => {
    try {
        const response = await axios.post(process.env.AMZ_ENDPOINT, {
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
