import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

const app = express();

//Body parser
app.use(express.json());

//Enable CORS
app.use(cors());

//Load env vars
dotenv.config({
    path: './.env'
})

const PORT = process.env.PORT || 3000;

app.listen(3000, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
})