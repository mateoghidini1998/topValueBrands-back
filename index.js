const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const app = express();

//Body parser
app.use(express.json());

//Enable CORS
app.use(cors());

//Route files
const auth = require('./routes/auth.routes');
const products = require('./routes/products.routes');

//Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/products', products);


//Load env vars
dotenv.config({
    path: './.env'
})

const PORT = process.env.PORT || 3000;

app.listen(3000, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
})