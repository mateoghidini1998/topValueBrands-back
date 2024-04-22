import express from 'express';
import cors from 'cors';

const app = express();

//Body parser
app.use(express.json());

//Enable CORS
app.use(cors());

const PORT = process.env.PORT || 3000;

app.listen(3000, () => {
    console.log("Server running on port", PORT)
})