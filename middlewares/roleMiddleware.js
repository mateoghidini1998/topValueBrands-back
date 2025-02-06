exports.roleMiddleware = (allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.user.publicMetadata.role)) {
    return res.status(403).json({ msg: 'Forbidden: You do not have access to this resource' });
  }
  next();
};
