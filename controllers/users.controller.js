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
   if (loggedInUser.role !== 'admin') {
      return res.status(401).json({ success: false, errors: [{ msg: 'User has no clearance to delete this user' }] });
   }

   if (!user) {
      return res.status(404).json({ success: false, errors: [{ msg: 'User not found' }] });
   }

   if (loggedInUser.id === user.id) {
      return res.status(400).json({ success: false, errors: [{ msg: 'User cannot delete themselves' }] });
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
   console.log(loggedInUser)

   const user = await User.findByPk(req.params.id);

   console.log('Role:', loggedInUser.role)
   console.log(user)
   if (loggedInUser.role !== 'admin') {
      return res.status(401).json({ errors: [{ msg: 'User has no clearance to modify this user' }] });
   }

   if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
   }

   const { role } = req.body;

   const validRoles = ['admin', 'user'];

   const lowerCaseRole = role.toLowerCase();
   if (!validRoles.includes(lowerCaseRole)) {
      return res.status(400).json({ errors: [{ msg: 'Invalid role' }] });
   }

   await user.update({ role: lowerCaseRole })

   return res.status(200).json({
      success: true,
      data: user
   })
});

//@route    PATCH api/users/update/:id -> of the user being updated
//@desc     Update user information
//@access   Private
exports.updateUser = asyncHandler(async (req, res, next) => {
   const loggedInUser = req.user;
   //  console.log(loggedInUser)
   const user = await User.findByPk(req.params.id);
   if (loggedInUser.role !== 'admin' && loggedInUser.id !== user.id) {
      return res.status(401).json({success:false, errors: [{ msg: 'User has no clearance to modify this user' }] });
   }
   if (!user) {
      return res.status(404).json({success:false, errors: [{ msg: 'User not found' }] });
   }

   // Check if user exists by email
   const { firstName, lastName, email, password, confirmPassword, role } = req.body;
   console.log(req.body);

   if (password !== confirmPassword) {
      return res.status(400).json({success:false, errors: [{ msg: 'Passwords do not match' }] });
   }

   const userExists = await User.findOne({ where: { email } });
   if (userExists && userExists.id !== user.id) {
      return res.status(400).json({success:false, errors: [{ msg: 'User already exists' }] });
   }

   await user.update({ firstName, lastName, email, role, password })
   return res.status(200).json({
      success: true,
      data: user
   })
})


//@route    PATCH api/users/changePassword/:id -> of the user being updated
//@desc     Modify user password
//@access   Private
exports.changePassword = asyncHandler(async (req, res, next) => {
   const loggedInUser = req.user;
   console.log(loggedInUser)
   const user = await User.findByPk(req.params.id);

   if (loggedInUser.role !== 'admin' && loggedInUser.id !== user.id) {
      return res.status(401).json({ errors: [{ msg: 'User has no clearance to modify this user' }] });
   }

   if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
   }

   const { password, repeatPassword } = req.body;

   if (password !== repeatPassword) {
      return res.status(400).json({ errors: [{ msg: 'Passwords do not match' }] });
   }

   await user.update({ password })

   return res.status(200).json({
      success: true,
      data: user
   })
})