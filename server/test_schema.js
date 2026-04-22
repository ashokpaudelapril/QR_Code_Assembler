const mongoose = require('mongoose');

// --- NEW SCHEMA DEFINITION ---
const qrItemSchema = new mongoose.Schema({
  id: String,
  name: String,
  type: String,
  data: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  qrLibrary: [qrItemSchema]
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
    
    // Explicit mapping (simulating the fix in server.js)
    const { id, name, type, data, createdAt } = qrItem;
    const cleanItem = {
      id: id || Date.now().toString(),
      name: name || 'Untitled QR',
      type: type || 'Unknown',
      data: data || '',
      createdAt: createdAt || new Date()
    };

    user.qrLibrary.unshift(cleanItem);
    console.log('✅ Unshift successful');
    await user.validate();
    console.log('✅ Validation successful');
    console.log('Final user object:', JSON.stringify(user, null, 2));
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

test();
