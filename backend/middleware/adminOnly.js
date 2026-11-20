// middleware/adminOnly.js — only emails listed in ADMIN_EMAILS (backend/.env) get through.
// Use after authMiddleware.
const { isAdmin } = require('../services/creditService');

const { loadAdmins } = require('../services/creditService');

module.exports = async (req, res, next) => {
  try { await loadAdmins(); } catch (_) { /* fall back to ADMIN_EMAILS */ }
  if (!isAdmin(req.user)) {
    return res.status(403).json({ detail: 'Admins only. Add your email to ADMIN_EMAILS in backend/.env and restart.' });
  }
  next();
};
