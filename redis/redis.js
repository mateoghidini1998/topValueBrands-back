const redis = require("redis");
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

// Environment variables for cache
const cacheHostName = process.env.AZURE_CACHE_FOR_REDIS_HOST_NAME;
const cachePassword = process.env.AZURE_CACHE_FOR_REDIS_ACCESS_KEY;

if (!cacheHostName) throw Error("AZURE_CACHE_FOR_REDIS_HOST_NAME is empty")
if (!cachePassword) throw Error("AZURE_CACHE_FOR_REDIS_ACCESS_KEY is empty")

const redisClient = redis.createClient({
  // redis for TLS
  url: `redis://${cacheHostName}:6380`,
  password: cachePassword
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

// Example: Set and get a value
redisClient.set('key', 'value', (err, reply) => {
  if (err) throw err;
  console.log(reply); // Should print 'OK'
});

redisClient.get('key', (err, reply) => {
  if (err) throw err;
  console.log(reply); // Should print 'value'
});

module.exports = redisClient;