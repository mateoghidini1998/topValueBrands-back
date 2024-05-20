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
const pogenerator = require('./routes/pogenerator.routes')

const { swaggerDoc } = require('./routes/swagger.routes');

//Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/products', products);
app.use('/api/v1/reports', reports);
app.use('/api/v1/users', users);
app.use('/api/v1/pogenerator', pogenerator);

//Load env vars
dotenv.config({
    path: './.env'
})

const PORT = process.env.PORT || 5000;

app.listen(5000, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
    swaggerDoc(app, PORT);
})