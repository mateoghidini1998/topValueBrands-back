const redis = require("redis");
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

// Variables de entorno para la caché
const cacheHostName = process.env.AZURE_CACHE_FOR_REDIS_HOST_NAME;
const cachePassword = process.env.AZURE_CACHE_FOR_REDIS_ACCESS_KEY;

if (!cacheHostName) throw new Error("AZURE_CACHE_FOR_REDIS_HOST_NAME is empty");
if (!cachePassword) throw new Error("AZURE_CACHE_FOR_REDIS_ACCESS_KEY is empty");

exports.connect = async () => {
  let client;

  if (process.env.NODE_ENV === 'production') {
    client = redis.createClient({
      // Configuración de Redis para TLS en producción
      url: `redis://${cachePassword}@${cacheHostName}:6380`,
      tls: {
        rejectUnauthorized: true // Asegúrate de que este valor sea verdadero para requerir SSL
      }
    });
  } else {
    // Configuración local de Redis para pruebas
    client = redis.createClient({
      host: 'localhost',
      port: 6379
    });
  }

  client.on('connect', () => {
    console.log('Cliente Redis conectado al servidor');
  });

  client.on('error', (err) => {
    console.error('El cliente Redis no pudo conectarse al servidor:', err);
  });

  client.on('end', () => {
    console.log('La conexión del cliente Redis se cerró');
  });

  await client.connect();

  return client;
};
