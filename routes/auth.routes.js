const express = require('express');
const router = express.Router();

const {
    register,
    getAllUsers,
    updateUserRole,
    changeUserPassword
} = require('../controllers/auth.controller');


router.get('/', getAllUsers)
router.post('/register', register);
router.patch('/:userId', updateUserRole);
router.patch('/:userId/change-password', changeUserPassword);


module.exports = router;