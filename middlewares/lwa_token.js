// middleware.js

const axios = require('axios');
const asyncHandler = require('./async');
const dotenv = require('dotenv');

dotenv.config({
    path: './.env'
})


let accessToken = null;
let tokenExpiration = new Date(0);

async function fetchNewToken() {
    const response = await axios.post(`${process.env.AMZ_ENDPOINT}`, {
       'grant_type': 'refresh_token',
       'refresh_token': process.env.REFRESH_TOKEN,
       'client_id': process.env.CLIENT_ID,
       'client_secret': process.env.CLIENT_SECRET
    });
   
    accessToken = response.data.access_token;
    tokenExpiration = new Date(Date.now() + response.data.expires_in * 1000);
    return accessToken;
}

exports.addAccessTokenHeader = asyncHandler(async(req, res, next) => {
    try {
        const now = new Date(Date.now());
        if(!accessToken || !tokenExpiration  || now >= tokenExpiration ) {
            console.log('Fetching new token...');
            accessToken = await fetchNewToken();
            req.headers['x-amz-access-token'] = accessToken;
            console.log(accessToken)
        } else {
            console.log('Token is still valid...')
            req.headers['x-amz-access-token'] = accessToken;
            console.log(accessToken)
        }
    
        next();
    } catch (error) {
        console.error('Error fetching access token:', error);
        next(error);
    }
})

