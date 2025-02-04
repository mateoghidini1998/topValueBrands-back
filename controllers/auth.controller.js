const { clerkClient } = require('@clerk/express');
const asyncHandler = require("../middlewares/async")

const userRoleOptions = ["admin", "warehouse"]

exports.register = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, username, password, confirmPassword, role } = req.body

  // Validate role
  if (!userRoleOptions.includes(role)) {
    return res.status(400).json({ success: false, errors: [{ msg: "User role must be admin or warehouse" }] })
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

exports.getAllUsers = asyncHandler(async (req, res, next) => {
  try {
    // Get pagination parameters from query string, with defaults
    const limit = Number.parseInt(req.query.limit) || 10
    const offset = Number.parseInt(req.query.offset) || 0

    // Fetch users from Clerk
    const { data: users, total_count } = await clerkClient.users.getUserList({
      limit: limit,
      offset: offset,
    })

    // Map the users to a more concise format
    const formattedUsers = users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.emailAddresses[0]?.emailAddress,
      role: user.publicMetadata.role,
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
      username: user.username,
    }))

    // Calculate pagination metadata
    const totalPages = Math.ceil(total_count / limit)
    const currentPage = Math.floor(offset / limit) + 1

    // Return the response
    return res.status(200).json({
      success: true,
      count: users.length,
      pagination: {
        total: total_count,
        limit: limit,
        offset: offset,
        totalPages: totalPages,
        currentPage: currentPage,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
      data: formattedUsers,
    })
  } catch (error) {
    console.error("Error fetching users from Clerk:", error)

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
      error: "Error fetching users from Clerk",
      details: error.message,
    })
  }
})

exports.updateUserRole = asyncHandler(async (req, res, next) => {
  const { userId } = req.params
  const { role } = req.body

  // Validate role
  if (!userRoleOptions.includes(role)) {
    return res.status(400).json({
      success: false,
      error: "Invalid role",
      message: 'User role must be either "admin" or "user"',
    })
  }

  try {
    // Fetch the user from Clerk
    const user = await clerkClient.users.getUser(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
        message: `No user found with id: ${userId}`,
      })
    }

    // Update the user's role in Clerk
    const updatedUser = await clerkClient.users.updateUser(userId, {
      publicMetadata: { ...user.publicMetadata, role: role },
    })

    // Return the updated user information
    return res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: {
        id: updatedUser.id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        username: updatedUser.username,
        email: updatedUser.emailAddresses[0]?.emailAddress,
        role: updatedUser.publicMetadata.role,
        updatedAt: updatedUser.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error updating user role in Clerk:", error)

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
      error: "Error updating user role in Clerk",
      message: error.message,
    })
  }
})
