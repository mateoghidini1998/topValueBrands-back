const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
    sendCSVasJSON,
} = require('../controllers/reports.controller');

router.get('/', addAccessTokenHeader ,sendCSVasJSON);

module.exports = router;