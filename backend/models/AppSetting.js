// models/AppSetting.js — settings you change from the Admin page (plans, free credits…)
const mongoose = require('mongoose');

const appSettingSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true },
  value:     { type: mongoose.Schema.Types.Mixed, default: null },
  updatedBy: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AppSetting', appSettingSchema);
