const { clerkClient } = require('@clerk/express');
const asyncHandler = require("../middlewares/async")

const userRoleOptions = ["admin", "user"]

exports.register = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, username, password, confirmPassword, role } = req.body

  // Validate role
  if (!userRoleOptions.includes(role)) {
    return res.status(400).json({ success: false, errors: [{ msg: "User role must be admin or user" }] })
  }

  // Validate password match
  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, errors: [{ msg: "Passwords do not match" }] })
  }

  try {
    // Create user in Clerk
    const user = await clerkClient.users.createUser({
      firstName,
      lastName,
      emailAddress: [email],
      password,
      username,
      publicMetadata: { role },
    })

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.emailAddresses[0].emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        role: user.publicMetadata.role,
      },
    })
  } catch (error) {
    console.error("Error registering user with Clerk:", error)

    // Check for specific Clerk errors
    if (error.errors && error.errors.length > 0) {
      const clerkErrors = error.errors.map((err) => ({
        msg: err.message,
        code: err.code,
        longMessage: err.long_message,
      }))
      return res.status(400).json({ success: false, errors: clerkErrors })
    }

    return res.status(500).json({
      success: false,
      errors: [{ msg: "Error registering user in Clerk", details: error.message }],
    })
  }
})

