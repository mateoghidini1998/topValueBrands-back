const redis = require('redis');
/* const client = redis.createClient({
    host: 'localhost',
    port: 6379
});

client.on('connect', () => {
    console.log('Redis client connected to the server');
});

client.on('error', (err) => {
    console.log('Redis client not connected to the server: ' + err);
});

client.on('end', () => {
    console.log('Redis client connection closed');
}); */

exports.connect = async () => {
    const client = redis.createClient({
        host: 'localhost',
        port: 6379
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

