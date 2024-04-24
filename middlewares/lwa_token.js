// middleware.js

const axios = require('axios');
const asyncHandler = require('./async');
const dotenv = require('dotenv');

dotenv.config({
    path: './.env'
})


// Middleware para obtener el token y agregarlo a los headers
exports.addAccessTokenHeader = asyncHandler(async (req, res, next) => {
  try {
      // Obtener el token utilizando getLWAToken
      const response = await axios.post(`${process.env.AMZ_ENDPOINT}`, {
          'grant_type': 'refresh_token',
          'refresh_token': process.env.REFRESH_TOKEN,
          'client_id': process.env.CLIENT_ID,
          'client_secret': process.env.CLIENT_SECRET
      });

      const accessToken = response.data;

      // Agregar el token a los headers
      req.headers['x-amz-access-token'] = accessToken.access_token;

      // Registrar el token en la consola para verificar
      // console.log('x-amz-access-token:', accessToken.access_token);

      // Llamar al siguiente middleware en la cadena
      next();
  } catch (error) {
      // Manejar errores
      console.error('Error fetching access token:', error);
      // Si ocurrió un error, llamar al siguiente middleware con el error
      next(error);
  }
});

