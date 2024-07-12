const redis = require("redis");
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

// Environment variables for cache
const cacheHostName = process.env.AZURE_CACHE_FOR_REDIS_HOST_NAME;
const cachePassword = process.env.AZURE_CACHE_FOR_REDIS_ACCESS_KEY;

if (!cacheHostName) throw new Error("AZURE_CACHE_FOR_REDIS_HOST_NAME is empty");
if (!cachePassword) throw new Error("AZURE_CACHE_FOR_REDIS_ACCESS_KEY is empty");

/* const redisClient = redis.createClient({
  // redis for TLS
  url: `redis://default:${cachePassword}@${cacheHostName}:6380`,
  tls: {
    rejectUnauthorized: false
  }
}); */

exports.connect = async () => {
  const client = redis.createClient({
      url: 'redis://default:${cachePassword}@${cacheHostName}:6380',
      tls: {
        rejectUnauthorized: false
      }
  });

  client.on('connect', () => {
      console.log('Redis client connected to the server');
  });

  client.on('error', (err) => {
      console.log('Redis client not connected to the server: ' + err);
  });

  client.on('end', () => {
      console.log('Redis client connection closed');
  });

  await client.connect();

  return client;
}


