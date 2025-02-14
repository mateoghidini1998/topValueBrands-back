exports.LIMIT_PRODUCTS = parseInt(process.env.LIMIT_PRODUCTS, 10) || 20000;
exports.OFFSET_PRODUCTS = parseInt(process.env.OFFSET_PRODUCTS, 10) || 0;
exports.BATCH_SIZE_FEES = parseInt(process.env.BATCH_SIZE_FEES, 10) || 50;
exports.MS_DELAY_FEES = parseInt(process.env.MS_DELAY_FEES, 10) || 2000;
exports.ASINS_PER_GROUP = parseInt(process.env.ASINS_PER_GROUP, 10) || 70;
exports.MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 3;