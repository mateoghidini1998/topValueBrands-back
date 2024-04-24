const express = require('express');
const router = express.Router();
// const { protect } = require('../middlewares/auth');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
    getToken,
    getInventorySummary,
} = require('../controllers/products.controller');

router.post('/', getToken);
router.get('/inventorySummary', addAccessTokenHeader, getInventorySummary);


module.exports = router;