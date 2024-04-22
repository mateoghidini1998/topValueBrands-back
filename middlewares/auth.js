const jwt = require('jsonwebtoken');
const asyncHandler = require('./async');
const { User } = require('../models');

//Protect Routes 
exports.protect = asyncHandler(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.token) {
        token = req.cookies.token;
    }

    //Make sure token exists
    if(!token){
        return res.status(401).json({ msg: 'Not authorized to access this route' });
    }

    try {       
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.id);
        if (!user) {
            return next(new ErrorResponse('User not found', 404));
        }
        req.user = user;
        next();
    } catch (error) {
        console.log(error)
        return res.status(401).json({ msg: 'Not authorized to access this route' });
    }  
    
});

exports.authorize = (...roles) => {
    return (req, res, next) => {
        if(!roles.includes(req.user.role)){
            return res.status(403).json({ msg: `User role ${req.user.role} is not authorized to access this route` });
        }
    }
}