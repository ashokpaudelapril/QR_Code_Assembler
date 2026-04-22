const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  qrLibrary: [{
    id: String,
    name: String,
    type: String,
    data: String,
    createdAt: { type: Date, default: Date.now }
  }]
});

const User = mongoose.model('User', userSchema);

async function test() {
  const qrItem = {
    id: '1776652396797.2693',
    name: 'Imported LinkedIn',
    type: 'SOCIAL',
    data: 'https://www.linkedin.com/in/ashokpaudelapril?fromQR=1',
    createdAt: '2026-04-20T02:33:16.797Z'
  };

  try {
    const user = new User({ qrLibrary: [] });
    user.qrLibrary.unshift(qrItem);
    console.log('✅ Unshift successful');
    await user.validate();
    console.log('✅ Validation successful');
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

test();
