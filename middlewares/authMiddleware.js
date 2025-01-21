const { clerkClient, getAuth } = require('@clerk/express');


exports.authMiddleware = async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ msg: 'Unauthorized' });
    }

    // Obtener el usuario de Clerk
    const user = await clerkClient.users.getUser(userId);

    if (user.locked) {
      return res.status(403).json({ msg: 'User account is locked' });
    }

    // Agregar información del usuario a la request para su posterior uso en los controladores
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ msg: 'Authentication failed', error: error.message });
  }
};
