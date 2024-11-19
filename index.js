const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');

const app = express();

app.use(express.json());


//Load env vars
dotenv.config({
  path: './.env',
});




const corsOptions = {
  origin: [
    "https://top-value-brands-front.vercel.app",
    "https://www.thepopro.com",
    "https://thepopro.com",
    "http://localhost:3000",
    "http://localhost:3001"
  ],
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
  credentials: true,  // Si necesitas permitir cookies entre dominios
};

//Enable CORS with options
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));  // Responder a preflight requests para todas las rutas

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
const outgoingshipment = require('./routes/shipments.routes')
const pallets = require('./routes/pallets.routes')

const { swaggerDoc } = require('./routes/swagger.routes');
const cron = require('node-cron');
const { addAccessTokenHeader } = require('./middlewares/lwa_token');
const { syncDBWithAmazon } = require('./controllers/reports.controller');
const logger = require('./logger/logger');
const { generateTrackedProductsData } = require('./controllers/trackedproducts.controller');

//Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/products', products);
app.use('/api/v1/reports', reports);
app.use('/api/v1/users', users);
app.use('/api/v1/trackedproducts', trackedproducts);
app.use('/api/v1/suppliers', suppliers);
app.use('/api/v1/purchaseorders', purchaseorders);
app.use('/api/v1/shipments', outgoingshipment)
app.use('/api/v1/pallets', pallets)

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log('DATABASE_URL_LOCAL:', process.env.DATABASE_URL_LOCAL);
  swaggerDoc(app, PORT);


  cron.schedule('30 3,12 * * *', async () => {
    logger.info('Cron executed at ' + new Date().toLocaleString());

    // Mock request, response, and next for the cron job context
    const req = { headers: {} };
    const res = {
      status: (code) => {
        logger.info('Cron job response status:', code);
        console.log('Cron job response status:', code);
        return res;
      },
      json: (data) => logger.info('Cron job response:'),
    };
    const next = (error) => {
      if (error) {
        console.error('Cron job error:', error);
      }
    };

    try {
      // sync database with amazon cronjob
      logger.info('1. Scheduling cron job to sync database with Amazon...');
      console.log('1. Scheduling cron job to sync database with Amazon...');
      // await addAccessTokenHeader(req, res, async () => {
      await syncDBWithAmazon(req, res, next);
      logger.info('Cron job for syncing database with Amazon completed.');
      console.log('Cron job for syncing database with Amazon completed.');
      // });

      // If the first block succeeded, proceed to the second block
      logger.info('2. Scheduling cron job to generate tracked products...');
      console.log('2. Scheduling cron job to generate tracked products...');
      await addAccessTokenHeader(req, res, async () => {
        await generateTrackedProductsData(req, res, next);
        logger.info('Cron job for generating tracked products completed.');
        console.log('Cron job for generating tracked products completed.');
      });
    } catch (error) {
      console.error('Error during scheduled cron job:', error);
    }
  }, {
    // TIME ZONE NEW YORK
    timezone: "America/New_York",
    scheduled: true,
  });

});
