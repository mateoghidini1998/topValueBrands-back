const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const { Op } = require('sequelize');
const logger = require('./logger/logger');

// Controllers
const { getShipmentTracking } = require('./controllers/outgoingshipments.controller');
const { syncDBWithAmazon } = require('./controllers/reports.controller');
const { generateTrackedProductsData } = require('./controllers/trackedproducts.controller');

// Models
const { OutgoingShipment } = require('./models');

// Initialize app
const app = express();
app.use(express.json());

// Load env vars
dotenv.config({ path: './.env' });

// CORS configuration
const corsOptions = {
  origin: [
    "https://top-value-brands-front.vercel.app",
    "https://www.thepopro.com",
    "https://thepopro.com",
    "http://localhost:3000",
  ],
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Cookie Parser
app.use(cookieParser());

// Route files
const auth = require('./routes/auth.routes');
const products = require('./routes/products.routes');
const reports = require('./routes/reports.routes');
const users = require('./routes/users.routes');
const trackedproducts = require('./routes/trackedproducts.routes');
const suppliers = require('./routes/suppliers.routes');
const purchaseorders = require('./routes/purchaseorders.routes');
const outgoingshipment = require('./routes/shipments.routes');
const pallets = require('./routes/pallets.routes');
const { swaggerDoc } = require('./routes/swagger.routes');

// Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/products', products);
app.use('/api/v1/reports', reports);
app.use('/api/v1/users', users);
app.use('/api/v1/trackedproducts', trackedproducts);
app.use('/api/v1/suppliers', suppliers);
app.use('/api/v1/purchaseorders', purchaseorders);
app.use('/api/v1/shipments', outgoingshipment);
app.use('/api/v1/pallets', pallets);

// Server setup
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log('DATABASE_URL_LOCAL:', process.env.DATABASE_URL_LOCAL);
  swaggerDoc(app, PORT);

  // Cron job to sync database with Amazon
  cron.schedule('30 3,12 * * *', async () => {
    logger.info('Cron executed at ' + new Date().toLocaleString());
    const req = { headers: {} };
    const res = {
      status: (code) => {
        logger.info(`Cron job response status: ${code}`);
        return res;
      },
      json: (data) => logger.info('Cron job response: ' + JSON.stringify(data)),
    };
    const next = (error) => {
      if (error) logger.error('Cron job error:', error);
    };

    try {
      logger.info('1. Syncing database with Amazon...');
      await syncDBWithAmazon(req, res, next);
      logger.info('2. Generating tracked products data...');
      await generateTrackedProductsData(req, res, next);
    } catch (error) {
      logger.error('Error during scheduled cron job:', error);
    }
  }, {
    timezone: "America/New_York",
    scheduled: true,
  });

  // Cron job to track shipments every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Executing shipment tracking cron job at ' + new Date().toLocaleString());
    const req = { headers: {} };
    const res = {
      status: (code) => {
        logger.info(`Shipment tracking response status: ${code}`);
        return res;
      },
      json: (data) => logger.info(`Shipment tracking response: ${JSON.stringify(data)}`),
    };

    try {
      await getShipmentTracking(req, res);
      logger.info('Shipment tracking cron job completed successfully.');
    } catch (error) {
      logger.error('Error during shipment tracking cron job:', error);
    }
  }, {
    timezone: 'America/New_York',
    scheduled: true,
  });

  // Cron job to delete old shipments
  const deleteOldShipments = async () => {
    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    try {
      const result = await OutgoingShipment.destroy({
        where: {
          ShipmentStatus: { [Op.not]: 'PENDING' },
          createdAt: { [Op.lt]: threeWeeksAgo },
        },
      });

      logger.info(`Deleted ${result} old shipments successfully.`);
    } catch (error) {
      logger.error('Error deleting old shipments:', error);
    }
  };

  // Cron job to delete old shipments every day at 6am
  cron.schedule('0 6 * * *', async () => {
    logger.info('Executing old shipments cleanup cron job at ' + new Date().toLocaleString());
    await deleteOldShipments();
  }, {
    timezone: 'America/New_York',
    scheduled: true,
  });
});
