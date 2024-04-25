const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');

const {
    register,
    login,
    getMe
} = require('../controllers/auth.controller');

router.post('/login', login);
router.post('/register', protect, register);
router.get('/me', protect, getMe);

module.exports = router;