const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');

const {
    register,
    login
} = require('../controllers/auth.controller');

router.post('/login', login);
router.post('/register', protect, register);

module.exports = router;