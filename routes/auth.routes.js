const express = require('express');
const router = express.Router();

const {
    register,
    getAllUsers,
    updateUserRole
} = require('../controllers/auth.controller');


router.get('/', getAllUsers)
router.post('/register', register);
router.patch('/:userId', updateUserRole);


module.exports = router;