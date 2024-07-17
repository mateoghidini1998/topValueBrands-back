const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');

const app = express();

//Body parser
app.use(express.json());

/* const  corsOptions = {

  origin: "*",
  
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept"],
  
}; */

//Enable CORS
app.use(cors());

//Cookie Parser
app.use(cookieParser());

//Route files
const auth = require('./routes/auth.routes');
const products = require('./routes/products.routes');
const reports = require('./routes/reports.routes');
const users = require('./routes/users.routes');
const trackedproducts = require('./routes/trackedproducts.routes');
const suppliers = require('./routes/suppliers.routes');
const purchaseorders = require('./routes/purchaseorders.routes');

const { swaggerDoc } = require('./routes/swagger.routes');
const cron = require('node-cron');
const { addAccessTokenHeader } = require('./middlewares/lwa_token');
const { syncDBWithAmazon } = require('./controllers/reports.controller');
const logger = require('./logger/logger');
const { generateTrackedProductsData } = require('./controllers/trackedproducts.controller');
const { importJSON } = require('./utils/utils')

//Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/products', products);
app.use('/api/v1/reports', reports);
app.use('/api/v1/users', users);
app.use('/api/v1/trackedproducts', trackedproducts);
app.use('/api/v1/suppliers', suppliers);
app.use('/api/v1/purchaseorders', purchaseorders);

//Load env vars
dotenv.config({
  path: './.env',
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  swaggerDoc(app, PORT);

  cron.schedule('31 11 * * *', async () => {
    logger.info('Cron executed at ' + new Date().toLocaleString());


    // Mock request, response, and next for the cron job context
    const req = { headers: {} };
    const res = {
      json: (data) => logger.info('Cron job response:', data),
    };
    const next = (error) => {
      if (error) {
        console.error('Cron job error:', error);
      }
    };

    // sync database with amazon cronjob
    try {
      logger.info('1. Scheduling cron job to sync database with Amazon...');
      await addAccessTokenHeader(req, res, async () => {
        await syncDBWithAmazon(req, res, next);
        logger.info('Cron job for syncing database with Amazon completed.');
      });
    } catch (error) {
      console.error('Error during scheduled sync database with Amazon:', error);
      return; // Optional: stop the next job if the first one fails
    }

    // generate tracked products cronjob
    try {
      logger.info('2. Scheduling cron job to generate tracked products...');
      await addAccessTokenHeader(req, res, async () => {
        await generateTrackedProductsData(req, res, next);
        logger.info('Cron job for generating tracked products completed.');
      });
    } catch (error) {
      console.error('Error during scheduled generate tracked products:', error);
    }

    // import JSON cronjob
    /* try {
      logger.info('3. Scheduling cron job to import JSON data...');
      await importJSON();
      logger.info('Cron job for importing JSON data completed.');
    } catch (error) {
      console.error('Error during scheduled import JSON data:', error);
    } */
  });
});
