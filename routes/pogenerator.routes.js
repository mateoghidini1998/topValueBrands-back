const express = require('express');
const router = express.Router();

const {
    generateORderReport
} = require('../controllers/reports.controller');

router.get('/', generateORderReport);

module.exports = router;