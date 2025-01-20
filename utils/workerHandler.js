const { Worker } = require('worker_threads');
const path = require('path');
const logger = require('../logger/logger');

function runWorker(workerScript, data) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.resolve(__dirname, workerScript), { workerData: data });

        worker.on('message', (message) => {
            resolve(message);
        });

        worker.on('error', (error) => {
            logger.error(error);
            reject(error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                logger.error(new Error(`Worker stopped with exit code ${code}`));
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

module.exports = runWorker;