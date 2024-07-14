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
const { fetchNewToken } = require('./middlewares/lwa_token');

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

  cron.schedule('* * * 5 *', async () => {
    console.log('running a task every day at 5am');
    // try {
    //   const accessToken = fetchNewToken();
    //   // Call createReport and get the reportId
    //   const report = await sendCSVasJSON(req, res, next);

    //   // Continue with the rest of the code after sendCSVasJSON has completed
    //   const newSync = await processReport(report);

    //   // Call addImageToProducts to add images to new products
    //   // const newProducts = await Product.findAll({ where: { product_image: null } || { product_image: '' } });
    //   // const accessToken = req.headers['x-amz-access-token'];
    //   // const imageSyncResult = await addImageToProducts(newProducts, accessToken);
    //   const imageSyncResult = await addImageToNewProducts(accessToken);

    //   res.json({ newSync, imageSyncResult });
    //   return { newSync, imageSyncResult };
    // } catch (error) {
    //   console.error(error);
    // }

  });
});
