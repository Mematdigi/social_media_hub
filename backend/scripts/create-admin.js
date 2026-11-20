// scripts/create-admin.js — create (or promote) an admin account from the server terminal.
//
//   cd /var/www/social_media_hub/backend
//   node scripts/create-admin.js admin@yourcompany.com "Your Name" 'StrongPassword123'
//
// • If the email is new, a normal SocialHub account is created with that password.
// • If the account already exists, its password is NOT changed (leave the password out).
// • The email is added to the Admin list (Admin page → Admins), so no .env edit or restart is needed.
// Add --company to also make it a company account (free AI, usage tracked).
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const credits = require('../services/creditService');
const CreditWallet = require('../models/CreditWallet');

const args = process.argv.slice(2).filter(a => a !== '--company');
const makeCompany = process.argv.includes('--company');
const [emailArg, name = 'Admin', password] = args;
const email = String(emailArg || '').trim();

(async () => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.log('Usage: node scripts/create-admin.js admin@yourcompany.com "Your Name" \'StrongPassword123\' [--company]');
    process.exit(1);
  }
  const MONGO_URL = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const DB_NAME = process.env.DB_NAME || 'SM_Tool';
  await mongoose.connect(`${MONGO_URL}/${DB_NAME}`);

  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let user = await User.findOne({ email: new RegExp(`^${escaped}$`, 'i') });
  if (!user) {
    if (!password || password.length < 8) {
      console.log('❌ New account: give a password of at least 8 characters.');
      process.exit(1);
    }
    user = await User.create({
      id: uuidv4(),
      name,
      email,
      password: await bcrypt.hash(password, 12),
      avatar: '',
      role: 'admin',
      createdAt: new Date(),
    });
    console.log(`✅ Account created: ${email}`);
  } else {
    console.log(`ℹ️  Account already exists: ${user.email} (password unchanged)`);
  }

  const settings = await credits.getSettings();
  const admins = [...new Set([...(settings.admins || []), user.email.toLowerCase()])];
  await credits.saveSettings({ ...settings, admins }, 'create-admin-script');
  console.log(`🛡️  ${user.email} is now an admin. Log in and open /admin.`);

  if (makeCompany) {
    await credits.getWallet(user.id);
    await CreditWallet.updateOne({ userId: user.id }, { $set: { company: true, companyNote: 'Set by create-admin script' } });
    console.log('🏢 Company account: free AI, usage tracked.');
  }
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error('❌', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
