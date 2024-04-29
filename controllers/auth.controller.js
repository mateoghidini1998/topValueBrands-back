const express = require('express');
const { User } = require('../models')
const asyncHandler = require('../middlewares/async')

//@route    POST api/auth/register
//@desc     Register a user
//@access   Private
exports.register = asyncHandler(async(req, res, next) => {
    const { firstName, lastName, email, password } = req.body;

    if(req.user.role !== 'admin'){
        return res.status(401).json({ errors: [{ msg: `User ${req.user.firstName} ${req.user.lastName} has no clearance to create a new user` }] });
    }
    
    let user = await User.findOne({ where: { email } });

    //Check if user exists
    if(user){
        return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
    }

    //Create user
    user = await User.create({firstName, lastName, email, password})

    return res.status(201).json({
        success: true,
        user
    })
});

//@route   POST api/auth
//@desc    Authenticate user & get token
//@access  public
exports.login = asyncHandler(async(req, res, next) => {
    const { email, password } = req.body;

    if(!email || !password){
        return res.status(400).json({ errors: [{ msg: 'Please enter all fields' }] });
    }

    //Check if user exists
    let user = await User.findOne({ where: { email: email }});

    if(!user){
        return res.status(400).json({ errors: [{ msg: 'User not found' }] });
    }

    const isMatch = await user.matchPassword(password);
    if(!isMatch){
        return res.status(401).json({ errors: [{ msg: 'Invalid credentials' }] })
    }

    sendTokenResponse(user, 200, res);
})

// @desc   Get current logged in user
// @route  POST /api/v1/auth/me
// @access Private

exports.getMe = asyncHandler(async (req, res, next) => {   
  const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
  });
  res.status(200).json({
      success: true,
      data: user
  });
});

//Get Token from model, create a cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
    // Create token
     const token = user.getSignedJwtToken();
   
     const options = {
       expires: new Date(
         Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
       ),
       httpOnly: true
     };
   
     if (process.env.NODE_ENV === 'production') {
       options.secure = true;
     }
   
     res
       .status(statusCode)
       .cookie('token', token, options)
       .json({
         success: true,
         token
       });
 };
 