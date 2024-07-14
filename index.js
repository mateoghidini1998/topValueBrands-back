const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');

const app = express();

//Body parser
app.use(express.json());

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
const { syncDBWithAmazon } = require('./controllers/reports.controller')

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

app.listen(5000, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  swaggerDoc(app, PORT);

  cron.schedule('28 11 * * *', async () => {
    console.log('running a task every day at 11:26am');
      try {
        console.log('Estoy aca')
        const req = { headers: {} }; // Mock request object with headers
        const res = {
          json: (data) => console.log('Sync result:', data),
        }; // Mock response object
        const next = (error) => {
          if (error) {
            console.error('Error during sync:', error);
          }
        }; // Mock next function for error handling
        console.log('Por ejecutar token')
        await addAccessTokenHeader(req, res, async () => {
          console.log('Por generar report')
          await syncDBWithAmazon(req, res, next);
        });
      } catch (error) {
        console.error('Error during scheduled sync:', error);
      }
    });
});
