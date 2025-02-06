const LIMIT_PRODUCTS = parseInt(process.env.LIMIT_PRODUCTS, 10) || 20000;
const OFFSET_PRODUCTS = parseInt(process.env.OFFSET_PRODUCTS, 10) || 0;
const BATCH_SIZE_FEES = parseInt(process.env.BATCH_SIZE_FEES, 10) || 50;
const MS_DELAY_FEES = parseInt(process.env.MS_DELAY_FEES, 10) || 2000;
const ASINS_PER_GROUP = parseInt(process.env.ASINS_PER_GROUP, 10) || 70;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 3;

// const LIMIT_PRODUCTS = 20000;
// const OFFSET_PRODUCTS = 0;
// const BATCH_SIZE_FEES = 50;
// const MS_DELAY_FEES = 2000; // Tiempo de delay en milisegundos
// const ASINS_PER_GROUP = 70;
// const MAX_RETRIES = 3;