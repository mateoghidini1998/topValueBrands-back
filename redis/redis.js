const redis = require("redis");
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

// Environment variables for cache
const cacheHostName = process.env.AZURE_CACHE_FOR_REDIS_HOST_NAME;
const cachePassword = process.env.AZURE_CACHE_FOR_REDIS_ACCESS_KEY;

if (!cacheHostName) throw new Error("AZURE_CACHE_FOR_REDIS_HOST_NAME is empty");
if (!cachePassword) throw new Error("AZURE_CACHE_FOR_REDIS_ACCESS_KEY is empty");


exports.connect = async () => {
  let client;

  if (process.env.NODE_ENV === 'production') {
    client = redis.createClient({
      url: `redis://${cachePassword}@${cacheHostName}:6380`,
      socket: {
        tls: {
          rejectUnauthorized: true
        }
      }
    });
  } else {
    client = redis.createClient({
      socket: {
        host: 'localhost',
        port: 6379
      }
    });
  }

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
