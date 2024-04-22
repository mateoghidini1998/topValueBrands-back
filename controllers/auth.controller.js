const express = require('express');
const {User} = require('../models')
const asyncHandler = require('../middlewares/async')

exports.register = asyncHandler(async(req, res, next) => {
    const { firstName, lastName, email, password } = req.body;
    
    let user = await User.findOne({ email });

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