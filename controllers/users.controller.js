const { User } = require('../models');
const asyncHandler = require('../middlewares/async');


//@route    GET api/users/
//@desc     Get all users
//@access   Private

exports.getUsers = asyncHandler(async (req, res, next) => {
    const users = await User.findAll();
    return res.status(200).json({
       success: true,
       data: users
    })
});   

//@route    DELETE api/users/deleteUser
//@desc     Delete user 
//@access   Private

exports.deleteUser = asyncHandler(async (req, res, next) => {
    const loggedInUser = req.user;
    const user = await User.findByPk(req.params.id);
    console.log(loggedInUser)
    if(loggedInUser.role !== 'admin') {
       return res.status(401).json({ errors: [{ msg: 'User has no clearance to delete this user' }] });
    }

    if(!user) {
       return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }

    await user.destroy();

    return res.status(200).json({
       success: true,
       data: {}
    })
});


//@route    PATCH api/users/updateRole
//@desc     Modify user role
//@access   Private

exports.updateUserRole = asyncHandler(async (req, res, next) => {
    const loggedInUser = req.user;
    const user = await User.findByPk(req.params.id);
   
    console.log('Role:' , loggedInUser.role)
   
    if(loggedInUser.role !== 'admin') {
       return res.status(401).json({ errors: [{ msg: 'User has no clearance to modify this user' }] });
    }
   
    if(!user) {
       return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
   
    const { role } = req.body;
    const validRoles = ['admin', 'user']; 

    const lowerCaseRole = role.toLowerCase();
    if (!validRoles.includes(lowerCaseRole)) {
       return res.status(400).json({ errors: [{ msg: 'Invalid role' }] });
    }
   
    await user.update({role: lowerCaseRole})
   
    return res.status(200).json({
       success: true,
       data: user
    })
});

