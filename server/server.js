require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = require('./models/User');
const sendEmail = require('./utils/email');
require('./config/passport')(passport);

const multer = require('multer');
const path = require('path');

// Multer Storage Config
// --- Multer Storage (Absolute Pathing) ---
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
    const fileExt = path.extname(file.originalname || '').toLowerCase();

    // Some browsers/providers send generic MIME types for valid files.
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
      cb(null, true);
      return;
    }

    cb(new Error('Only PDFs and Images (PNG, JPG) are allowed'), false);
  }
});

const app = express();

// --- Middleware ---
app.use(cors({
  origin: true, // Allow all origins during development
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: false }));

// --- Session Setup ---
app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET || 'omniqr_secret_key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    httpOnly: true,
    sameSite: 'lax',
    secure: false // Set to true if using HTTPS
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// --- Handshake Logger (Deep Diagnostics) ---
app.use((req, res, next) => {
  const origin = req.headers.origin || 'No Origin';
  const hasCookie = !!req.headers.cookie;
  const sessionID = req.sessionID ? req.sessionID.substring(0, 8) : 'No Session';
  const user = req.user ? req.user.email : 'Anonymous';
  
  if (req.url !== '/favicon.ico') {
    console.log(`[📡 SYNC] ${req.method} ${req.url} | Session: ${sessionID} | User: ${user} | Origin: ${origin}`);
  }
  next();
});

app.use('/uploads', express.static(uploadsDir));

const normalizeAllowedEmails = (emails) => {
  if (!Array.isArray(emails)) return [];
  return [...new Set(
    emails
      .map(email => String(email || '').trim().toLowerCase())
      .filter(email => /^\S+@\S+\.\S+$/.test(email))
  )];
};

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI, { dbName: 'OmniQR_Console' })
  .then(() => console.log('✅ MongoDB Connected [OmniQR_Console]'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- Enterprise Redirection (Public) ---
app.get('/q/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Find item across all users
    const user = await User.findOne({ 'qrLibrary.id': id });
    if (!user) return res.status(404).send('Not Found');

    const item = user.qrLibrary.find(i => i.id === id);
    if (!item || !item.isDynamic) return res.status(404).send('Not Found');

    const accessLevel = item.accessLevel || 'public';
    const ownerEmail = String(user.email || '').toLowerCase();
    const requesterEmail = String(req.user?.email || '').toLowerCase();
    const allowedEmails = normalizeAllowedEmails(item.allowedEmails || []);
    const isOwner = requesterEmail && requesterEmail === ownerEmail;
    const isAllowed = requesterEmail && allowedEmails.includes(requesterEmail);

    if (accessLevel === 'restricted' && !isOwner && !isAllowed) {
      return res.status(403).send('This link is restricted. Please sign in with an authorized email address.');
    }

    // Log the scan
    item.scanCount = (item.scanCount || 0) + 1;
    item.scanHistory.push({
      timestamp: new Date(),
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });

    await user.save();
    
    // Redirect to target
    res.redirect(302, item.targetUrl || '/');
  } catch (err) {
    console.error('Redirection error:', err);
    res.status(500).send('Redirection Error');
  }
});

// --- Auth Routes ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
  }
);

const sendVerificationEmail = async (user, req) => {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken = verificationToken;
  user.emailVerificationExpires = Date.now() + 24 * 3600000; // 24 hours
  await user.save();

  const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/?verifyToken=${verificationToken}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 600px;">
      <h2 style="color: #0B57D0;">Welcome to OmniQR Console!</h2>
      <p>Thank you for joining. Please verify your email address to secure your account and unlock all features.</p>
      <div style="margin: 30px 0;">
        <a href="${verifyUrl}" style="background: #0B57D0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 30px; font-weight: bold;">Verify Email Address</a>
      </div>
      <p style="font-size: 0.8rem; color: #666;">This link will expire in 24 hours. If you did not sign up for an account, please ignore this email.</p>
    </div>
  `;

  await sendEmail({
    email: user.email,
    subject: 'Verify Your Email - OmniQR Console',
    message: `Welcome! Please verify your email here: ${verifyUrl}`,
    html
  });
};

app.post('/auth/register', async (req, res) => {
  const { email, password, displayName } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    user = await User.create({ email, password: hashedPassword, displayName });
    
    // Send verification email in background
    sendVerificationEmail(user, req).catch(err => console.error('Error sending verification email:', err));

    req.login(user, (err) => {
      if (err) return res.status(500).json({ message: 'Login failed' });
      res.json({ message: 'Registered successfully. Please check your email for verification link.', user: { email: user.email, displayName: user.displayName, isEmailVerified: user.isEmailVerified } });
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/auth/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(400).json({ message: info.message });
    
    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.json({ 
        message: 'Logged in successfully', 
        user: { 
          email: user.email, 
          displayName: user.displayName,
          isEmailVerified: user.isEmailVerified 
        } 
      });
    });
  })(req, res, next);
});

app.post('/auth/change-password', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters long.' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user.password) {
      return res.status(400).json({ message: 'This account uses Google Login. Password cannot be changed here.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      // Return success even if email not found for security (enum prevention)
      return res.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    if (!user.password) {
      return res.status(400).json({ message: 'This account uses Google Login. Please recover via Google.' });
    }

    // 1. Generate random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // 2. Send Email
    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/?resetToken=${resetToken}`;
    const message = `You requested a password reset. Please follow this link: ${resetUrl}`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your OmniQR Console password.</p>
        <div style="margin: 30px 0;">
          <a href="${resetUrl}" style="background: #0B57D0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 30px; font-weight: bold;">Reset Password</a>
        </div>
        <p style="font-size: 0.8rem; color: #666;">This link will expire in 1 hour. If you did not request this, please ignore this email.</p>
      </div>
    `;

    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request - OmniQR Console',
      message,
      html
    });

    res.json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error sending reset email.' });
  }
});

app.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Token is invalid or has expired.' });
    }

    // Hash and Save
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during reset.' });
  }
});

app.post('/auth/resend-verification', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  if (req.user.isEmailVerified) return res.status(400).json({ message: 'Email already verified' });

  try {
    const user = await User.findById(req.user.id);
    await sendVerificationEmail(user, req);
    res.json({ message: 'Verification email resent successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Error resending email.' });
  }
});

app.post('/auth/verify-email', async (req, res) => {
  const { token } = req.body;
  try {
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Token is invalid or has expired.' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully!', user: { isEmailVerified: true } });
  } catch (err) {
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ message: 'Logout failed' });
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

// --- API Routes for Library ---
app.get('/api/library', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  res.json(req.user.qrLibrary);
});

app.post('/api/library', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  
  try {
    console.log(`📥 Adding QR to Library: ${req.body.name} (${req.body.type})`);
    const user = await User.findById(req.user.id);
    if (!user) {
      console.error('❌ User not found for ID:', req.user.id);
      return res.status(404).json({ message: 'User not found' });
    }
    const { id, name, type, data, createdAt, isDynamic, targetUrl, accessLevel, allowedEmails } = req.body;
    const normalizedAccessLevel = accessLevel === 'restricted' ? 'restricted' : 'public';
    const normalizedAllowedEmails = normalizedAccessLevel === 'restricted'
      ? normalizeAllowedEmails(allowedEmails)
      : [];

    const cleanItem = {
      id: id || Date.now().toString(),
      name: name || 'Untitled QR',
      type: type || 'Unknown',
      data: data || '',
      createdAt: createdAt || new Date(),
      isDynamic: isDynamic || false,
      targetUrl: targetUrl || '',
      accessLevel: normalizedAccessLevel,
      allowedEmails: normalizedAllowedEmails
    };

    user.qrLibrary.unshift(cleanItem); // Use clean object
    await user.save();
    console.log('✅ QR saved successfully');
    res.json(user.qrLibrary);
  } catch (err) {
    console.error('❌ Error saving to library:', err);
    res.status(500).json({ message: 'Server error saving to library', error: err.message });
  }
});

app.delete('/api/library/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  
  try {
    const user = await User.findById(req.user.id);
    user.qrLibrary = user.qrLibrary.filter(item => item.id !== req.params.id);
    await user.save();
    res.json(user.qrLibrary);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.patch('/api/library/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  
  try {
    const user = await User.findById(req.user.id);
    const item = user.qrLibrary.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    if (req.body.name) item.name = req.body.name;
    if (req.body.targetUrl) item.targetUrl = req.body.targetUrl;
    if (req.body.accessLevel) {
      item.accessLevel = req.body.accessLevel === 'restricted' ? 'restricted' : 'public';
      if (item.accessLevel === 'public') item.allowedEmails = [];
    }
    if (Array.isArray(req.body.allowedEmails)) {
      item.allowedEmails = item.accessLevel === 'restricted'
        ? normalizeAllowedEmails(req.body.allowedEmails)
        : [];
    }

    await user.save();
    res.json(user.qrLibrary);
  } catch (err) {
    res.status(500).json({ message: 'Server error updating library item' });
  }
});

// --- API Routes for Settings & Profile ---
app.patch('/api/settings', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const user = await User.findById(req.user.id);
    user.settings = { ...user.settings, ...req.body };
    await user.save();
    res.json(user.settings);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// --- Document Upload ---
app.post('/api/upload-doc', (req, res) => {
  if (!req.isAuthenticated()) {
    console.error('❌ PDF Upload Denied: Unauthorized request');
    return res.status(401).json({ message: 'Authentication required for document hosting' });
  }

  upload.single('document')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File exceeds 10MB limit' });
      }
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  });
});

app.patch('/api/user', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const user = await User.findById(req.user.id);
    if (req.body.displayName) user.displayName = req.body.displayName;
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
