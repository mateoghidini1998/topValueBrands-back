const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth')

const { 
    updateUserRole,
    deleteUser,
    getUsers
} = require('../controllers/users.controller')

router.get('/', protect, authorize('admin') ,getUsers)
router.patch('/:id', protect, authorize('admin'), updateUserRole);
router.delete('/:id', protect, authorize('admin'), deleteUser);

module.exports = router;