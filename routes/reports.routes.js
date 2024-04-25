const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
    generateReport
} = require('../controllers/reports.controller');

router.get('/', addAccessTokenHeader ,generateReport);

module.exports = router;