const express = require('express');
const { GetListingStatus } = require('../controllers/amazon.controller');
const { addAccessTokenHeader } = require('../middlewares/lwa_token');
const router = express.Router();

router.get('/listing-status/', addAccessTokenHeader, GetListingStatus);

module.exports = router; 