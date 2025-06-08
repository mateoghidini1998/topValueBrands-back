const { parentPort } = require('worker_threads');
const { OutgoingShipment } = require('../models');
const logger = require('../logger/logger');
const { Op } = require('sequelize');

(async () => {
    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    try {
        console.log('Worker: Deleting old shipments...');
        logger.info('Worker: Deleting old shipments...');
        const result = await OutgoingShipment.destroy({
            where: {
                status: {[Op.notIn]: ['DRAFT', 'WORKING'] },
                createdAt: { [Op.lt]: threeWeeksAgo },
            },
        });

        parentPort.postMessage(`Worker: Deleted ${result} old shipments successfully`);
    } catch (error) {
        console.log('Worker: Error deleting old shipments:', error);
        parentPort.postMessage({ error: error.message });
    }
})();