const mongoose = require('mongoose');

const qrItemSchema = new mongoose.Schema({
  id: String,
  name: String,
  type: String,
  data: String,
  createdAt: { type: Date, default: Date.now },
  isDynamic: { type: Boolean, default: false },
  targetUrl: String,
  accessLevel: { type: String, enum: ['public', 'restricted'], default: 'public' },
  allowedEmails: [{ type: String, lowercase: true, trim: true }],
  scanCount: { type: Number, default: 0 },
  scanHistory: [{
    timestamp: { type: Date, default: Date.now },
    userAgent: String,
    ip: String
  }]
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  displayName: String,
  googleId: String,
  password: {
    type: String,
    // Password is only required for manual accounts, not Google ones
    required: function() { return !this.googleId; }
  },
  avatar: String,
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  qrLibrary: [qrItemSchema],
  history: [{
    data: String,
    scannedAt: { type: Date, default: Date.now }
  }],
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  settings: {
    themeColor: { type: String, default: '#0B57D0' },
    isDarkMode: { type: Boolean, default: false },
    brandLogo: { type: String, default: null },
    exportFormat: { type: String, default: 'png' }, // 'png' or 'svg'
    qrStyle: {
      dotType: { type: String, default: 'rounded' },
      cornerType: { type: String, default: 'extra-rounded' },
      cornerDotType: { type: String, default: 'dot' }
    }
  }
}, { timestamps: true, collection: 'credentials' });

module.exports = mongoose.model('User', userSchema);
