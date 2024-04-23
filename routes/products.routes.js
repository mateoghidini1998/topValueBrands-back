const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');

const { 
    getToken
 } = require('../controllers/products.controller')

router.post('/', getToken); 

module.exports = router;