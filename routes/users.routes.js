const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth')

const { 
    updateUserRole
} = require('../controllers/users.controller')

router.patch('/:id', protect, authorize('admin'), updateUserRole);

module.exports = router;