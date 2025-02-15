const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
    syncDBWithAmazon,
    downloadReport,
} = require('../controllers/reports.controller');


router.get('/sync', addAccessTokenHeader, syncDBWithAmazon);
router.get('/download/:filename', downloadReport);


module.exports = router;