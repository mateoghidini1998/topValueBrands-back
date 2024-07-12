const redis = require("redis");
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

// Environment variables for cache
const cacheHostName = process.env.AZURE_CACHE_FOR_REDIS_HOST_NAME;
const cachePassword = process.env.AZURE_CACHE_FOR_REDIS_ACCESS_KEY;

if (!cacheHostName) throw new Error("AZURE_CACHE_FOR_REDIS_HOST_NAME is empty");
if (!cachePassword) throw new Error("AZURE_CACHE_FOR_REDIS_ACCESS_KEY is empty");

const redisClient = redis.createClient({
  // redis for TLS
  url: `redis://default:${cachePassword}@${cacheHostName}:6380`,
  tls: {
    rejectUnauthorized: false
  }
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('Redis client connected');

    // Example: Set and get a value
    await redisClient.set('key', 'value');
    const value = await redisClient.get('key');
    console.log(value); // Should print 'value'
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }
};

connectRedis();

module.exports = redisClient;
