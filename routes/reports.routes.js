const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
    syncDBWithAmazon,
} = require('../controllers/reports.controller');

router.get('/sync', addAccessTokenHeader ,syncDBWithAmazon);

module.exports = router;