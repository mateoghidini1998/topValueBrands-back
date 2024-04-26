const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
    sendCSVasJSON,
    syncDBWithAmazon,
} = require('../controllers/reports.controller');

router.get('/', addAccessTokenHeader ,sendCSVasJSON);
router.get('/sync', addAccessTokenHeader ,syncDBWithAmazon);

module.exports = router;