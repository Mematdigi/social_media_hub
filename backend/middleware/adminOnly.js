// middleware/adminOnly.js — only emails listed in ADMIN_EMAILS (backend/.env) get through.
// Use after authMiddleware.
const { isAdmin } = require('../services/creditService');

module.exports = (req, res, next) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ detail: 'Admins only. Add your email to ADMIN_EMAILS in backend/.env and restart.' });
  }
  next();
};
