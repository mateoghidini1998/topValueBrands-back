const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');

const {
    register,
    login,
    getMe
} = require('../controllers/auth.controller');

router.post('/login', login);
router.post('/register', protect, authorize('admin'), register);
router.get('/me', protect, getMe);

module.exports = router;