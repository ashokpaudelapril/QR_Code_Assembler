import './style.css';
import QRCodeStyling from 'qr-code-styling';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { QR_SCHEMAS } from './generator-types';
import { processQRCodeImage } from './qr-processor';

// --- API Constants ---
const API_URL = ''; // Proxied through Vite/localhost
const getPublicBaseUrl = () => window.location.origin;

// --- Console State ---
const initialState = {
  activeView: 'dashboard',
  user: null, // null means not logged in
  collection: [],
  selectedIds: [],
  isSelectionMode: false,
  history: [],
  settings: {
    defaultColor: '#0B57D0',
    defaultCorner: 'extra-rounded'
  },
  currentGenerator: {
    type: 'URL',
    fields: { url: '' }
  },
  isEmailVerified: false
};

let state = { ...initialState };
window.state = state; // Expose globally for inline event handlers

// --- UI Utilities ---
const showNotification = (message, type = 'info', actions = null) => {
  let container = document.querySelector('.notification-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'notification-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  const actionList = Array.isArray(actions) ? actions : (actions ? [actions] : []);
  const duration = actionList.some(a => a.label === 'Confirm') ? 15000 : 4000;

  // Track if we should show sync status
  window.updateSyncStatus(true);

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-message">${message}</div>
    <button class="toast-close-btn">✕</button>
    <div class="toast-actions">
      ${actionList.map((a, i) => `<button class="toast-action-btn ${a.type || 'primary'}" data-index="${i}">${a.label}</button>`).join('')}
    </div>
    <div class="toast-progress">
      <div class="toast-progress-bar" style="transition-duration: ${duration}ms; transform: scaleX(1)"></div>
    </div>
  `;

  // Manual Close
  const closeBtn = toast.querySelector('.toast-close-btn');
  closeBtn.onclick = () => closeToast(toast);

  actionList.forEach((a, i) => {
    const btn = toast.querySelector(`.toast-action-btn[data-index="${i}"]`);
    btn.onclick = (e) => {
      e.stopPropagation();
      a.callback();
      closeToast(toast);
    };
  });

  const closeToast = (t) => {
    if (!t.parentElement) return;
    t.classList.add('exit');
    setTimeout(() => t.remove(), 400);
  };

  container.appendChild(toast);

  // Trigger progress bar animation
  requestAnimationFrame(() => {
    const bar = toast.querySelector('.toast-progress-bar');
    if (bar) bar.style.transform = 'scaleX(0)';
  });

  setTimeout(() => {
    if (toast.parentElement) closeToast(toast);
  }, duration);
};

window.showConfirm = (message, confirmLabel = 'Confirm') => {
  return new Promise((resolve) => {
    showNotification(message, 'info', [
      { label: 'Cancel', type: 'ghost', callback: () => resolve(false) },
      { label: confirmLabel, type: 'primary', callback: () => resolve(true) }
    ]);
  });
};

// --- Auth & API Helpers ---
const apiFetch = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (response.status === 401) {
    if (state.user) {
      state.user = null;
      showNotification('Session expired. Please log in again.', 'info');
      renderAuth();
    } else {
      showNotification('Authentication failed. Check your credentials.', 'error');
    }
    return null;
  }
  
  if (response.ok) {
    window.updateSyncStatus?.(true);
  } else {
    window.updateSyncStatus?.(false);
  }
  
  return response;
};

const checkAuth = async () => {
  try {
    const res = await apiFetch('/auth/user');
    if (res && res.ok) {
      state.user = await res.json();
      state.isEmailVerified = state.user.isEmailVerified;
      
      // Sync global settings from server
      if (state.user.settings) {
        state.settings.defaultColor = state.user.settings.themeColor || state.settings.defaultColor;
        if (state.user.settings.isDarkMode) document.body.classList.add('dark-mode');
      }

      await fetchLibrary();

      // Check for verification token in URL after login
      const urlParams = new URLSearchParams(window.location.search);
      const verifyToken = urlParams.get('verifyToken');
      if (verifyToken) {
        handleEmailVerification(verifyToken);
      } else {
        renderCurrentView();
      }
      
      updateSidebarUser();
    } else {
      renderAuth();
    }
  } catch (err) {
    renderAuth();
  }
};

const handleEmailVerification = async (token) => {
  try {
    const res = await apiFetch('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    state.isEmailVerified = true;
    showNotification('Email verified successfully! 🚀', 'success');
    window.history.replaceState({}, document.title, "/");
    renderDashboard();
  } catch (err) {
    showNotification(err.message || 'Verification failed.', 'error');
    renderDashboard();
  }
};

const fetchLibrary = async () => {
  const res = await apiFetch('/api/library');
  if (res && res.ok) {
    state.collection = await res.json();
  }
};

// --- View Router ---
const viewport = document.getElementById('viewport');
const sidebar = document.getElementById('sidebar');
const navItems = document.querySelectorAll('.nav-item');

const navigate = (view) => {
  if (!state.user && view !== 'login') {
    renderAuth();
    return;
  }
  state.activeView = view;
  state.selectedIds = [];
  state.isSelectionMode = false;
  
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  
  renderCurrentView();
};

const renderCurrentView = () => {
  if (!state.user) return renderAuth();
  
  sidebar.style.display = 'flex';
  switch (state.activeView) {
    case 'dashboard': renderDashboard(); break;
    case 'generate': renderGenerator(); break;
    case 'library': renderLibrary(); break;
    case 'scan': renderScan(); break;
    case 'settings': renderSettings(); break;
  }
};

// --- Auth (Login/Signup/Forgot) Views ---
const renderAuth = (mode = 'login') => {
  sidebar.style.display = 'none';
  
  // Check for reset token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('resetToken');
  if (resetToken && mode !== 'reset') return renderAuth('reset');

  let title = 'OmniQR Console';
  let sub = mode === 'login' ? 'Sign in to sync your QR collection' : 
            mode === 'signup' ? 'Create an account to get started' :
            mode === 'forgot' ? 'Enter email to receive reset link' :
            'Set your new password';

  viewport.innerHTML = `
    <div class="animate-fade-in" style="display: flex; align-items: center; justify-content: center; min-height: 80vh;">
      <div class="console-card" style="width: 100%; max-width: 400px; padding: 3rem; text-align: center;">
        <span style="font-size: 3rem; display: block; margin-bottom: 1rem;">🔲</span>
        <h1 style="font-size: 1.5rem; margin-bottom: 0.5rem;">${title}</h1>
        <p style="color: var(--m3-secondary); margin-bottom: 2rem;">${sub}</p>
        
        <form id="auth-form" style="text-align: left; display: flex; flex-direction: column; gap: 1rem;">
          ${mode === 'signup' ? `
            <div>
              <label>Full Name</label>
              <input type="text" id="auth-name" placeholder="Ashok Paudel" required>
            </div>
          ` : ''}

          ${mode !== 'reset' ? `
            <div>
              <label>Email Address</label>
              <input type="email" id="auth-email" placeholder="name@example.com" required>
            </div>
          ` : ''}

          ${(mode === 'login' || mode === 'signup' || mode === 'reset') ? `
            <div>
              <label>${mode === 'reset' ? 'New Password' : 'Password'}</label>
              <input type="password" id="auth-password" placeholder="••••••••" required minlength="8">
            </div>
          ` : ''}

          <button type="submit" class="btn-primary" style="margin-top: 1rem;">
            ${mode === 'login' ? 'Sign In' : 
              mode === 'signup' ? 'Create Account' : 
              mode === 'forgot' ? 'Send Reset Link' : 'Save New Password'}
          </button>
        </form>

        ${mode === 'login' ? `
          <div style="margin-top: 1rem;">
            <button style="background: none; border: none; color: var(--m3-secondary); font-size: 0.8rem; cursor: pointer;" onclick="window.renderAuth('forgot')">Forgot Password?</button>
          </div>
        ` : ''}

        ${(mode === 'login' || mode === 'signup') ? `
          <div style="margin: 2rem 0; display: flex; align-items: center; gap: 1rem; color: var(--m3-outline);">
            <hr style="flex-grow: 1; opacity: 0.2;"> OR <hr style="flex-grow: 1; opacity: 0.2;">
          </div>

          <button class="btn-ghost" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 12px;" onclick="window.location.href='${API_URL}/auth/google'">
            <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" width="20" alt="Google">
            Continue with Google
          </button>
        ` : ''}

        <p style="margin-top: 2rem; font-size: 0.875rem; color: var(--m3-secondary);">
          ${mode === 'login' ? "Don't have an account?" : 
            mode === 'signup' ? "Already have an account?" : 
            "Back to"}
          <button style="background: none; border: none; color: var(--m3-primary); font-weight: 600; cursor: pointer;" onclick="${mode === 'login' ? 'window.toggleAuthMode()' : mode === 'signup' ? 'window.toggleAuthMode()' : 'window.renderAuth(\'login\')'}">
            ${mode === 'login' ? 'Sign Up' : mode === 'signup' ? 'Log In' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  `;

  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email')?.value;
    const password = document.getElementById('auth-password')?.value;
    const displayName = document.getElementById('auth-name')?.value;
    
    let endpoint, body;
    if (mode === 'login') {
      endpoint = '/auth/login';
      body = { email, password };
    } else if (mode === 'signup') {
      endpoint = '/auth/register';
      body = { email, password, displayName };
    } else if (mode === 'forgot') {
      endpoint = '/auth/forgot-password';
      body = { email };
    } else if (mode === 'reset') {
      endpoint = '/auth/reset-password';
      body = { token: resetToken, newPassword: password };
    }
    
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        if (mode === 'forgot') {
          showNotification('Check your email for the reset link!', 'info');
          renderAuth('login');
        } else if (mode === 'reset') {
          showNotification('Password reset successful! Please log in.', 'success');
          window.history.replaceState({}, document.title, "/"); // Clear token from URL
          renderAuth('login');
        } else {
          checkAuth();
        }
      } else {
        showNotification(data.message || 'Authentication failed', 'error');
      }
    } catch (err) {
      showNotification('Authentication failed. Connection error.', 'error');
    }
  });
};
window.renderAuth = renderAuth;

window.toggleAuthMode = () => {
  const isLoginPage = viewport.innerHTML.includes('Sign In');
  renderAuth(isLoginPage ? 'signup' : 'login');
};

const updateSidebarUser = () => {
  const footer = document.querySelector('.sidebar-footer');
  if (footer && state.user) {
    footer.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 8px;">
        <img src="${state.user.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" style="width: 32px; height: 32px; border-radius: 50%;">
        <div style="overflow: hidden;">
          <div style="font-size: 0.8rem; font-weight: 600; white-space: nowrap; text-overflow: ellipsis;">${state.user.displayName}</div>
          <div style="font-size: 0.7rem; color: var(--m3-secondary); white-space: nowrap; text-overflow: ellipsis;">${state.user.email}</div>
        </div>
      </div>
      <button class="nav-item" onclick="window.consoleNavigate('settings')">
        <span class="icon">⚙️</span> Settings
      </button>
      <button class="nav-item" onclick="window.logout()">
        <span class="icon">🚪</span> Sign Out
      </button>
      <div id="sync-status-indicator" style="margin-top: auto; padding: 12px 16px; font-size: 0.65rem; color: var(--m3-secondary); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--m3-outline-variant);">
        <span style="color: #4CAF50">●</span> Cloud Synced
      </div>
    `;
  }
};

window.logout = async () => {
  await apiFetch('/auth/logout');
  state.user = null;
  state.collection = [];
  renderAuth();
};

window.updateSyncStatus = (isOk) => {
  const statusEl = document.getElementById('sync-status-indicator');
  if (statusEl) {
    statusEl.innerHTML = isOk ? '<span style="color: #4CAF50">●</span> Cloud Synced' : '<span style="color: #F44336">●</span> Sync Interrupted';
    statusEl.title = isOk ? 'Encryption Handshake Active' : 'Restart Dev Server Required';
  }
};

// --- Dashboard Module ---
const renderDashboardInsights = () => {
  const counts = {};
  state.collection.forEach(item => {
    counts[item.type] = (counts[item.type] || 0) + 1;
  });
  
  const total = state.collection.length || 1;
  const sortedTypes = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return `
    <div class="insight-bar-container">
      ${sortedTypes.map(([type, count]) => {
        const percentage = Math.round((count / total) * 100);
        return `
          <div class="insight-bar-group">
            <div class="insight-bar-label">
              <span>${QR_SCHEMAS[type]?.icon || '📦'} ${type}</span>
              <span>${percentage}%</span>
            </div>
            <div class="insight-bar-wrapper">
              <div class="insight-bar-fill" style="width: ${percentage}%; background: ${type === 'BANK_CARD' ? '#B3261E' : 'var(--m3-primary)'}"></div>
            </div>
          </div>
        `;
      }).join('') || '<p style="font-size: 0.8rem; color: var(--m3-secondary)">Generate assets to see portfolio distribution.</p>'}
    </div>
  `;
};

const renderDashboard = () => {
  viewport.innerHTML = `
    <div class="animate-fade-in">
      ${!state.isEmailVerified ? `
        <div class="dna-banner" style="background: var(--m3-surface-container-high); color: var(--m3-on-surface); border: 1px solid var(--m3-outline-variant); margin-bottom: 2rem;">
          <div style="font-size: 1.5rem;">✉️</div>
          <div style="flex-grow: 1;">
            <div style="font-weight: 500;">Verify your email address</div>
            <div style="font-size: 0.75rem; opacity: 0.7;">Please confirm your email to fully secure your assets.</div>
          </div>
          <button class="btn-ghost" id="resend-verify-btn" style="padding: 6px 16px;">Resend Link</button>
        </div>
      ` : ''}

      <header style="margin-bottom: 2rem;">
        <h1>Console <span class="text-gradient">Overview</span></h1>
        <p style="color: var(--m3-secondary)">Welcome back, ${state.user.displayName}</p>
      </header>

      <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div class="console-card stat-card">
          <div class="stat-value text-gradient">${state.collection.length}</div>
          <div class="stat-label">TOTAL CODES</div>
        </div>
        <div class="console-card stat-card">
          <div class="stat-value" style="color: var(--m3-secondary)">${state.history.length}</div>
          <div class="stat-label">TOTAL SCANS</div>
        </div>
        <div class="console-card stat-card">
          <div class="stat-value" style="color: ${state.isEmailVerified ? '#1B6EF3' : '#B3261E'}">${state.isEmailVerified ? 'VERIFIED' : 'UNVERIFIED'}</div>
          <div class="stat-label">ACCOUNT STATUS</div>
        </div>
      </div>

      <div class="console-card" style="margin-bottom: 2rem;">
        <div class="card-header">
          <h2>Library Distribution</h2>
          <span style="font-size: 0.7rem; color: var(--m3-secondary)">PORTFOLIO ANALYSIS</span>
        </div>
        ${renderDashboardInsights()}
      </div>

      <div class="grid-2">
        <div class="console-card">
          <div class="card-header">
            <h2>Recent Activity</h2>
            <button class="btn-ghost" onclick="window.consoleNavigate('library')">View All</button>
          </div>
          <div id="recent-list">
            ${state.collection.slice(0, 5).map(item => `
              <div style="display: flex; align-items: center; gap: 1rem; padding: 12px 0; border-bottom: 1px solid var(--m3-outline-variant)">
                <span style="font-size: 1.2rem;">${QR_SCHEMAS[item.type]?.icon || '📦'}</span>
                <div style="flex-grow: 1">
                  <div style="font-weight: 500; font-size: 0.9rem;">${item.name}</div>
                  <div style="font-size: 0.75rem; color: var(--m3-secondary)">${new Date(item.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            `).join('') || '<p style="color: var(--m3-outline); text-align: center; padding: 2rem;">Your collection is empty.</p>'}
          </div>
        </div>
        <div class="console-card">
          <h2>Quick Actions</h2>
          <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
            <button class="btn-ghost" style="text-align: left;" onclick="window.consoleNavigate('generate')">🪄 Create New QR Code</button>
            <button class="btn-ghost" style="text-align: left;" onclick="window.consoleNavigate('scan')">📥 Run Bulk Assembler</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('resend-verify-btn')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
      await apiFetch('/auth/resend-verification', { method: 'POST' });
      showNotification('Verification email sent! Check your inbox.', 'success');
      btn.textContent = 'Sent ✅';
    } catch (err) {
      showNotification(err.message || 'Failed to resend email.', 'error');
      btn.disabled = false;
      btn.textContent = 'Resend Email';
    }
  });
};

// --- Generator Module ---
const renderGenerator = () => {
  const schema = QR_SCHEMAS[state.currentGenerator.type];
  
  // Apply Global Defaults if not manually set for this session
  const defaults = state.user.settings?.qrStyle || {};
  
  viewport.innerHTML = `
    <div class="animate-fade-in">
      <header style="margin-bottom: 2rem;">
        <h1>Generator <span class="text-gradient">Studio</span></h1>
      </header>

      <div class="grid-2">
        <div class="console-card">
          <div class="card-header">
            <h3>Configuration</h3>
            <select id="gen-type-select" style="width: auto; min-width: 150px;" onchange="window.handleTypeChange(this.value)">
              ${Object.keys(QR_SCHEMAS).map(type => `
                <option value="${type}" ${state.currentGenerator.type === type ? 'selected' : ''}>${QR_SCHEMAS[type].icon} ${QR_SCHEMAS[type].label || type}</option>
              `).join('')}
            </select>
          </div>
          
          <div id="gen-fields" style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
            ${schema.fields.map(field => `
              <div>
                <label>${field.label}</label>
                ${field.type === 'file' ? `
                  <div class="premium-upload-zone" id="pdf-upload-dropzone">
                    <span style="font-size: 2rem;">📥</span>
                    <p style="font-size: 0.8rem; margin-top: 8px;" id="pdf-filename">${field.label}</p>
                    <input type="file" id="gen-${field.id}" class="gen-input" data-id="${field.id}" accept="${field.accept}" style="display: none">
                  </div>
                ` : field.type === 'select' ? `
                  <select class="gen-input" data-id="${field.id}">
                    ${field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                  </select>
                ` : field.type === 'textarea' ? `
                  <textarea class="gen-input" data-id="${field.id}" placeholder="${field.placeholder}"></textarea>
                ` : `
                  <input type="${field.type}" class="gen-input" data-id="${field.id}" value="${state.currentGenerator.fields[field.id] || ''}" placeholder="${field.placeholder}">
                `}
              </div>
            `).join('')}
            <div style="margin-top: 1rem;">
              <label>Internal Name</label>
              <input type="text" id="gen-name" placeholder="My Awesome QR" value="${state.currentGenerator.name || ''}">
            </div>
          </div>
          <button class="btn-primary" id="save-collection" style="width: 100%; margin-top: 2rem;">Save to Cloud</button>
        </div>

        <div class="console-card" style="text-align: center;">
          <h3>Live Preview</h3>
          <div id="gen-preview-container" style="display: flex; justify-content: center; margin: 2rem 0; padding: 1.5rem; background: #fff; border-radius: 24px; min-height: 280px; align-items: center; border: 1px solid var(--m3-outline-variant);"></div>
          <div id="gen-style-info" style="font-size: 0.7rem; color: var(--m3-secondary); margin-bottom: 1rem; display: flex; gap: 1rem; justify-content: center;">
            <span>Dots: <b>${defaults.dotType || 'rounded'}</b></span>
            <span>Corners: <b>${defaults.cornerType || 'extra-rounded'}</b></span>
          </div>
          <div style="display: flex; gap: 0.75rem;">
            <button class="btn-ghost" style="flex: 1" id="download-svg">Download SVG</button>
            <button class="btn-primary" style="flex: 1" id="download-png">Download PNG</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  initGeneratorEvents();
  updatePreview();

  // PDF Dropzone Logic
  const dropzone = document.getElementById('pdf-upload-dropzone');
  const fileInput = document.querySelector('.gen-input[type="file"]');
  if (dropzone && fileInput) {
    dropzone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const icon = file.type.includes('image') ? '🖼️' : '📄';
        document.getElementById('pdf-filename').innerText = `${icon} ${file.name}`;
        state.currentGenerator.fields[fileInput.dataset.id] = file.name;
      }
    };
  }
};

window.handleTypeChange = (type) => {
  state.currentGenerator.type = type;
  state.currentGenerator.fields = {};
  renderGenerator();
};

const initGeneratorEvents = () => {

  document.querySelectorAll('.gen-input').forEach(input => {
    input.addEventListener('input', (e) => {
      state.currentGenerator.fields[e.target.dataset.id] = e.target.value;
      updatePreview();
    });
  });

  document.getElementById('gen-name').addEventListener('input', (e) => {
    state.currentGenerator.name = e.target.value;
  });

  document.getElementById('save-collection').addEventListener('click', async (e) => {
    const originalText = e.target.innerText;
    e.target.innerText = 'Syncing...';
    e.target.disabled = true;

    const schema = QR_SCHEMAS[state.currentGenerator.type];
    let data = schema.format ? schema.format(state.currentGenerator.fields) : state.currentGenerator.fields.document || '';
    let isDynamic = schema.isDynamic || false;
    let targetUrl = isDynamic ? data : '';

    // Handle Smart Asset Upload
    if (state.currentGenerator.type === 'SMART_ASSET') {
      const fileInput = document.querySelector('.gen-input[type="file"]');
      const file = fileInput?.files[0];
      if (!file) {
        showNotification('Please select a file (PDF or Image) first.', 'error');
        e.target.innerText = originalText;
        e.target.disabled = false;
        return;
      }

      const fileName = file.name || '';
      const fileExt = fileName.split('.').pop()?.toLowerCase();
      const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
      if (!fileExt || !allowedExtensions.includes(fileExt)) {
        showNotification('Only PDF, PNG, JPG, and JPEG files are supported.', 'error');
        e.target.innerText = originalText;
        e.target.disabled = false;
        return;
      }

      const maxUploadSize = 10 * 1024 * 1024;
      if (file.size > maxUploadSize) {
        showNotification('File is too large. Maximum size is 10MB.', 'error');
        e.target.innerText = originalText;
        e.target.disabled = false;
        return;
      }

      e.target.innerText = 'Uploading Asset...';
      const formData = new FormData();
      formData.append('document', file);
      
      try {
        const uploadRes = await fetch(`${API_URL}/api/upload-doc`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (!uploadRes.ok) {
          let message = 'Asset upload failed. Please try again.';
          try {
            const errData = await uploadRes.json();
            if (errData?.message) message = errData.message;
          } catch (_) {
            // Fall back to default message when response body is not JSON.
          }
          throw new Error(message);
        }

        const uploadData = await uploadRes.json();
        targetUrl = uploadData.url;
        data = 'CLOUD_REDIRECT'; // Internal marker for document host
        isDynamic = true;
      } catch (err) {
        showNotification(err.message || 'Asset upload failed. Please try again.', 'error');
        e.target.innerText = originalText;
        e.target.disabled = false;
        return;
      }
    }

    const qrItem = {
      id: Date.now().toString(),
      name: state.currentGenerator.name || 'Untitled QR',
      type: state.currentGenerator.type,
      data: data,
      createdAt: new Date().toISOString(),
      isDynamic: isDynamic,
      targetUrl: targetUrl,
      accessLevel: 'public',
      allowedEmails: []
    };

    try {
      const res = await apiFetch('/api/library', {
        method: 'POST',
        body: JSON.stringify(qrItem)
      });
      if (res && res.ok) {
        state.collection = await res.json();
        navigate('library');
      } else {
        showNotification('Failed to save to cloud', 'error');
      }
    } catch (err) {
      showNotification('Network error while saving', 'error');
    } finally {
      e.target.innerText = originalText;
      e.target.disabled = false;
    }
  });
};

let currentQR = null;
const updatePreview = () => {
  const schema = QR_SCHEMAS[state.currentGenerator.type];
  const data = typeof schema.format === 'function'
    ? (schema.format(state.currentGenerator.fields) || 'OmniQR Console')
    : 'OmniQR Console';
  const defaults = state.user.settings?.qrStyle || {};
  
  currentQR = new QRCodeStyling({
    width: 260,
    height: 260,
    data: data,
    dotsOptions: { 
      color: state.settings.defaultColor, 
      type: defaults.dotType || "rounded" 
    },
    cornersSquareOptions: { 
      type: defaults.cornerType || "extra-rounded" 
    },
    cornersDotOptions: {
      type: defaults.cornerDotType || "dot"
    },
    backgroundOptions: { color: "transparent" }
  });

  const container = document.getElementById("gen-preview-container");
  if (container) {
    container.innerHTML = '';
    currentQR.append(container);
  }

  document.getElementById('download-svg')?.addEventListener('click', () => currentQR.download({ extension: 'svg' }));
  document.getElementById('download-png')?.addEventListener('click', () => currentQR.download({ extension: 'png' }));
};

// --- Library Module ---
const renderLibrary = () => {
  viewport.innerHTML = `
    <div class="animate-fade-in">
      <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <div>
          <h1>Your <span class="text-gradient">Library</span></h1>
          <p style="font-size: 0.8rem; color: var(--m3-secondary);">Enterprise Brand Portfolio Management.</p>
        </div>
        <div style="display: flex; gap: 0.75rem; align-items: center;">
          <input type="text" id="lib-search" placeholder="Search codes..." style="width: 250px;">
          <button class="btn-primary" onclick="window.consoleNavigate('generate')">+ New</button>
        </div>
      </header>

      <div class="qr-grid" id="lib-grid">
        ${state.collection.map(item => {
          const isSelected = state.selectedIds.includes(item.id);
          const typeSchema = QR_SCHEMAS[item.type] || { icon: '📦' };
          return `
            <div class="qr-card ${isSelected ? 'selected' : ''}" onclick="window.state.isSelectionMode ? window.toggleSelection('${item.id}') : window.showQRModal('${item.id}')">
              <div class="qr-card-checkbox" onclick="event.stopPropagation(); window.toggleSelection('${item.id}')">
                ${isSelected ? '✓' : ''}
              </div>
              <div class="qr-card-preview" id="qr-preview-${item.id}">
                <div class="spinner" style="width: 20px; height: 20px;"></div>
              </div>
              <div class="qr-card-info">
                <div class="qr-card-title">${item.name}</div>
                <div class="qr-card-meta">
                  <span>${typeSchema.icon} ${item.type}</span>
                  <span>•</span>
                  <span>${new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                ${item.isDynamic ? `<div style="font-size: 0.7rem; color: #1B6EF3; margin-top: 4px;">🚀 DYNAMIC (${item.scanCount || 0} scans)</div>` : ''}
              </div>
              <div class="qr-card-actions" onclick="event.stopPropagation()">
                <button class="btn-ghost" onclick="window.downloadCleanQR('${item.id}')">📥</button>
                <button class="btn-ghost" style="flex: 0; color: var(--m3-error); border-color: var(--m3-error);" onclick="window.libDelete('${item.id}')">🗑️</button>
              </div>
            </div>
          `;
        }).join('') || '<div style="grid-column: 1/-1; text-align: center; padding: 5rem; opacity: 0.5;">Library is empty. Start generating!</div>'}
      </div>
      
      <div class="bulk-bar ${state.isSelectionMode ? 'active' : ''}">
        <span style="font-weight: 500">${state.selectedIds.length} assets selected</span>
        <div style="display: flex; gap: 8px;">
          <button class="btn-ghost" onclick="window.bulkExportZip()">📦 ZIP</button>
          <button class="btn-ghost" onclick="window.bulkExportPDF()">📄 PDF Sheet</button>
          <button class="btn-ghost" style="color: var(--m3-error)" onclick="window.bulkDelete()">🗑️</button>
          <button class="btn-primary" onclick="window.resetSelection()">✕</button>
        </div>
      </div>
    </div>
  `;
  
  initLibraryEvents();
  renderLibraryPreviews();
};

window.toggleSelection = (id) => {
  if (state.selectedIds.includes(id)) {
    state.selectedIds = state.selectedIds.filter(i => i !== id);
  } else {
    state.selectedIds.push(id);
  }
  state.isSelectionMode = state.selectedIds.length > 0;
  renderLibrary();
};

window.resetSelection = () => {
  state.selectedIds = [];
  state.isSelectionMode = false;
  renderLibrary();
};

const initLibraryEvents = () => {
  document.getElementById('lib-search')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('.qr-card');
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(term) ? '' : 'none';
    });
  });
};

window.bulkExportZip = async () => {
  const zip = new JSZip();
  const folder = zip.folder("omniqr_assets");
  
  showNotification('Generating ZIP archive...', 'info');
  
  for (const id of state.selectedIds) {
    const item = state.collection.find(i => i.id === id);
    if (!item) continue;
    
    const qr = new QRCodeStyling({
      width: 1000,
      height: 1000,
      data: item.isDynamic ? `${getPublicBaseUrl()}/q/${item.id}` : item.data,
      image: state.user.settings?.brandLogo || "",
      dotsOptions: { color: state.settings.defaultColor, type: state.user.settings?.qrStyle?.dotType || "rounded" },
      backgroundOptions: { color: "transparent" }
    });
    
    const blob = await qr.getRawData('png');
    folder.file(`${item.name.replace(/[^a-z0-9]/gi, '_')}.png`, blob);
  }
  
  const content = await zip.generateAsync({ type: "blob" });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = `OmniQR_Export_${new Date().getTime()}.zip`;
  link.click();
  showNotification('ZIP Export Complete! 📦', 'success');
};

window.bulkExportPDF = async () => {
  const doc = new jsPDF();
  const margin = 10;
  const size = 40;
  let x = margin, y = margin + 20;
  
  showNotification('Generating PDF Sheet...', 'info');
  
  doc.setFontSize(18);
  doc.text("OmniQR Asset Sheet", margin, margin + 10);
  doc.setFontSize(8);

  for (const id of state.selectedIds) {
    const item = state.collection.find(i => i.id === id);
    if (!item) continue;
    
    const qr = new QRCodeStyling({
      width: 400,
      height: 400,
      data: item.isDynamic ? `${getPublicBaseUrl()}/q/${item.id}` : item.data,
      dotsOptions: { color: "#000000", type: "rounded" }
    });
    
    const canvas = await qr.toCanvas();
    const dataUrl = qr._canvas.getCanvas().toDataURL('image/png');
    doc.addImage(dataUrl, 'PNG', x, y, size, size);
    doc.text(item.name.substring(0, 20), x, y + size + 5);
    
    x += size + 10;
    if (x > 160) {
      x = margin;
      y += size + 15;
    }
    if (y > 250) {
      doc.addPage();
      y = margin + 10;
    }
  }
  
  doc.save(`OmniQR_Labels_${new Date().getTime()}.pdf`);
  showNotification('PDF Label Sheet Saved! 📄', 'success');
};

window.bulkDelete = async () => {
  if (state.selectedIds.length === 0) return;
  const confirmed = await window.showConfirm(`Are you sure you want to delete these ${state.selectedIds.length} assets?`, 'Delete All');
  if (!confirmed) return;

  for (const id of state.selectedIds) {
    await apiFetch(`/api/library/${id}`, { method: 'DELETE' });
  }
  await fetchLibrary();
  state.selectedIds = [];
  state.isSelectionMode = false;
  renderLibrary();
  showNotification('Selection deleted successfully.', 'success');
};

const parseCardData = (data) => {
  const parts = data.replace('OMNIQR:CARD:', '').split(';');
  const card = {};
  parts.forEach(p => {
    if (p.startsWith('H:')) card.holder = p.substring(2);
    if (p.startsWith('N:')) card.number = p.substring(2);
    if (p.startsWith('E:')) card.expiry = p.substring(2);
    if (p.startsWith('W:')) card.network = p.substring(2);
  });
  return card;
};

window.showQRModal = (id) => {
  const item = state.collection.find(i => i.id === id);
  if (!item) return;

  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  const isBankCard = item.type === 'BANK_CARD' || item.data.startsWith('OMNIQR:CARD:');
  const cardData = isBankCard ? parseCardData(item.data) : null;
  const isDynamic = item.isDynamic;

  overlay.innerHTML = `
    <div class="qr-modal-content animate-fade-in" onclick="event.stopPropagation()">
      <button class="modal-close-btn" onclick="window.closeQRModal()">✕</button>
      
      <div class="modal-tabs">
        <div class="modal-tab active" data-tab="asset">Asset</div>
        ${isDynamic ? `<div class="modal-tab" data-tab="analytics">Analytics</div>` : ''}
        <div class="modal-tab" data-tab="settings">Settings</div>
      </div>

      <div class="tab-content active" id="tab-asset">
          <div class="zoom-controls">
            <label>Zoom</label>
            <input type="range" id="modal-zoom-slider" min="1" max="2" step="0.1" value="1">
          </div>
          <div class="expanded-qr-preview-container">
            <div class="expanded-qr-preview" id="modal-qr-preview">
              <div class="spinner"></div>
            </div>
          </div>
          <div class="expanded-info" style="margin-top: 1.5rem">
            ${isBankCard ? `
              <div class="virtual-card-mockup">
                <div class="card-chip"></div>
                <div class="card-number">
                  <span>${cardData.number?.substring(0,4)}</span>
                  <span>****</span>
                  <span>****</span>
                  <span>${cardData.number?.substring(12,16)}</span>
                </div>
                <div class="card-bottom">
                  <div class="card-holder">${cardData.holder || 'JOHN DOE'}</div>
                  <div class="card-expiry">
                    <div class="expiry-label">VALID THRU</div>
                    <div style="font-family: var(--font-mono)">${cardData.expiry || 'MM/YY'}</div>
                  </div>
                  <div class="network-logo">${cardData.network || 'VISA'}</div>
                </div>
              </div>
            ` : `
              <h2>${item.name}</h2>
              <div style="display: flex; gap: 12px; align-items: center;">
                <span>${QR_SCHEMAS[item.type]?.icon || '📦'} ${item.type}</span>
                <span>•</span>
                <span>Created ${new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
              <p style="margin-top: 1rem; font-size: 0.8rem; color: var(--m3-secondary); font-family: var(--font-mono); word-break: break-all;">
                ${item.data}
              </p>
            `}
          <button class="btn-primary" style="width: 100%; margin-top: 1.5rem;" onclick="window.downloadCleanQR('${item.id}')">📥 Download Asset</button>
        </div>
      </div>

      ${isDynamic ? `
        <div class="tab-content" id="tab-analytics">
          <div style="text-align: center; padding: 1rem;">
            <div style="font-size: 3rem; font-weight: 700;" class="text-gradient">${item.scanCount || 0}</div>
            <div style="font-size: 0.8rem; color: var(--m3-secondary)">TOTAL SCANS</div>
          </div>
          <div style="max-height: 200px; overflow-y: auto;">
            <table class="log-table">
              <thead>
                <tr><th>Time</th><th>Device</th></tr>
              </thead>
              <tbody>
                ${[...item.scanHistory].reverse().map(log => `
                  <tr>
                    <td>${new Date(log.timestamp).toLocaleString()}</td>
                    <td title="${log.userAgent}">${log.userAgent.substring(0, 20)}...</td>
                  </tr>
                `).join('') || '<tr><td colspan="2" style="text-align:center">No scans recorded yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <div class="tab-content" id="tab-settings">
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div>
            <label>Internal Name</label>
            <input type="text" id="edit-name" value="${item.name}" style="width: 100%">
          </div>
          ${isDynamic ? `
            <div>
              <label>Target URL (Dynamic)</label>
              <input type="url" id="edit-target" value="${item.targetUrl}" style="width: 100%">
              <p style="font-size: 0.7rem; color: var(--m3-secondary); margin-top: 4px;">Update the destination without changing the QR code.</p>
            </div>
            <div>
              <label>Access</label>
              <select id="edit-access-level" style="width: 100%">
                <option value="public" ${(item.accessLevel || 'public') === 'public' ? 'selected' : ''}>Public (anyone with QR)</option>
                <option value="restricted" ${(item.accessLevel || 'public') === 'restricted' ? 'selected' : ''}>Restricted (specific emails)</option>
              </select>
            </div>
            <div id="allowed-emails-wrap" style="display: ${(item.accessLevel || 'public') === 'restricted' ? 'block' : 'none'};">
              <label>Allowed Emails</label>
              <textarea id="edit-allowed-emails" style="width: 100%; min-height: 100px;" placeholder="name@gmail.com, second@company.com">${(item.allowedEmails || []).join(', ')}</textarea>
              <p style="font-size: 0.7rem; color: var(--m3-secondary); margin-top: 4px;">Comma or newline separated emails. Only these users can open the redirect link.</p>
            </div>
          ` : ''}
          <button class="btn-primary" onclick="window.updateLibraryItem('${item.id}')">Save Changes</button>
        </div>
      </div>
    </div>
  `;

  overlay.classList.add('active');
  
  // Tab Switching
  overlay.querySelectorAll('.modal-tab').forEach(tab => {
    tab.onclick = () => {
      overlay.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      overlay.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    };
  });

  // Render high-res QR in modal (pointing to redirect URL if dynamic)
  const qrData = item.isDynamic ? `${getPublicBaseUrl()}/q/${item.id}` : item.data;
  const defaults = state.user.settings?.qrStyle || {};
  const qr = new QRCodeStyling({
    width: 400,
    height: 400,
    data: qrData,
    image: state.user.settings?.brandLogo || "",
    dotsOptions: { color: state.settings.defaultColor, type: defaults.dotType || "rounded" },
    cornersSquareOptions: { type: defaults.cornerType || "extra-rounded" },
    backgroundOptions: { color: "transparent" }
  });
  
  const container = document.getElementById('modal-qr-preview');
  if (container) {
    container.innerHTML = '';
    qr.append(container);
  }

  // Zoom Logic
  const slider = document.getElementById('modal-zoom-slider');
  if (slider) {
    slider.oninput = (e) => {
      const scale = e.target.value;
      if (container) container.style.transform = `scale(${scale})`;
    };
  }

  const accessLevelSelect = document.getElementById('edit-access-level');
  if (accessLevelSelect) {
    accessLevelSelect.addEventListener('change', (e) => {
      const wrap = document.getElementById('allowed-emails-wrap');
      if (wrap) wrap.style.display = e.target.value === 'restricted' ? 'block' : 'none';
    });
  }
};

window.updateLibraryItem = async (id) => {
  const name = document.getElementById('edit-name').value;
  const targetUrl = document.getElementById('edit-target')?.value;
  const accessLevel = document.getElementById('edit-access-level')?.value || 'public';
  const allowedEmailsRaw = document.getElementById('edit-allowed-emails')?.value || '';
  const allowedEmails = allowedEmailsRaw
    .split(/[\n,]/)
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

  if (accessLevel === 'restricted' && allowedEmails.length === 0) {
    showNotification('Add at least one allowed email for restricted access.', 'error');
    return;
  }
  
  const res = await apiFetch(`/api/library/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, targetUrl, accessLevel, allowedEmails })
  });
  
  if (res && res.ok) {
    state.collection = await res.json();
    window.closeQRModal();
    renderLibrary();
    showNotification('Item updated successfully!', 'success');
  }
};

window.closeQRModal = () => {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('active');
};

const renderLibraryPreviews = () => {
  const defaults = state.user.settings?.qrStyle || {};
  state.collection.forEach(item => {
    const container = document.getElementById(`qr-preview-${item.id}`);
    if (!container) return;
    
    container.innerHTML = '';
    const qr = new QRCodeStyling({
      width: 180,
      height: 180,
      data: item.data,
      image: state.user.settings?.brandLogo || "",
      dotsOptions: { 
        color: state.settings.defaultColor, 
        type: defaults.dotType || "rounded" 
      },
      cornersSquareOptions: { 
        type: defaults.cornerType || "extra-rounded" 
      },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 5
      },
      backgroundOptions: { color: "transparent" }
    });
    qr.append(container);
    // Scale down the canvas to fit card
    const canvas = container.querySelector('canvas');
    if (canvas) {
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
    }
  });
};

window.downloadCleanQR = (id) => {
  const item = state.collection.find(i => i.id === id);
  if (!item) return;

  const defaults = state.user.settings?.qrStyle || {};
  const exportFormat = state.user.settings?.exportFormat || 'png';
  
  const qr = new QRCodeStyling({
    width: 1024, // High resolution for download
    height: 1024,
    data: item.data,
    image: state.user.settings?.brandLogo || "",
    dotsOptions: { 
      color: state.settings.defaultColor, 
      type: defaults.dotType || "rounded" 
    },
    cornersSquareOptions: { 
      type: defaults.cornerType || "extra-rounded" 
    },
    cornersDotOptions: {
      type: defaults.cornerDotType || "dot"
    },
    imageOptions: {
      crossOrigin: "anonymous",
      margin: 10
    },
    backgroundOptions: { color: "#ffffff" }
  });

  qr.download({ name: item.name.replace(/\s+/g, '_'), extension: exportFormat });
  showNotification(`Downloading as ${exportFormat.toUpperCase()}...`, 'success');
};

window.libDelete = async (id) => {
  const confirmed = await window.showConfirm('Are you sure you want to delete this brand asset? This action cannot be undone.', 'Delete Asset');
  if (!confirmed) return;
  
  try {
    const res = await apiFetch(`/api/library/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
      state.collection = await res.json();
      renderLibrary();
      showNotification('Asset deleted permanently.', 'info');
    }
  } catch (err) {
    showNotification('Delete failed.', 'error');
  }
};

// --- Scan / Assembler Module ---
const renderScan = () => {
  viewport.innerHTML = `
    <div class="animate-fade-in">
      <header style="margin-bottom: 2rem;">
        <h1>Bulk <span class="text-gradient">Assembler</span></h1>
      </header>

      <div class="console-card">
        <div id="drop-zone" class="drop-zone" style="padding: 5rem; text-align: center; border-radius: 24px; cursor: pointer;">
          <div id="drop-zone-content">
            <span style="font-size: 4rem;">📦</span>
            <h2 style="margin-top: 1.5rem;">Upload Existing QRs</h2>
            <p style="color: var(--m3-secondary); margin-top: 0.75rem;">Batch process images to extract deep-linked data</p>
          </div>
          <input type="file" id="qr-input" multiple accept="image/*" style="display: none;">
        </div>
      </div>
    </div>
  `;
  
  const dropZone = document.getElementById('drop-zone');
  const qrInput = document.getElementById('qr-input');
  
  dropZone?.addEventListener('click', () => qrInput.click());
  qrInput?.addEventListener('change', (e) => handleFiles(e.target.files));
  
  // Drag-and-Drop
  dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone?.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
};

const handleFiles = async (files) => {
  if (!files || files.length === 0) return;
  
  const content = document.getElementById('drop-zone-content');
  const originalHTML = content.innerHTML;
  content.innerHTML = `
    <div class="spinner" style="width: 48px; height: 48px; margin: 0 auto;"></div>
    <p style="margin-top: 1.5rem; font-weight: 500;">Deep-Scanning Components...</p>
    <p style="font-size: 0.75rem; color: var(--m3-secondary); margin-top: 0.5rem;">Attempting multi-stage re-assembly</p>
  `;

  let successCount = 0;
  let failCount = 0;
  let serverErrors = 0;
  const fileArray = Array.from(files);

  for (const file of fileArray) {
    try {
      const result = await processQRCodeImage(file);
      const qrItem = {
        id: (Date.now() + Math.random()).toString(),
        name: `Imported ${result.title}`,
        type: result.type.toUpperCase(),
        data: result.url,
        createdAt: new Date().toISOString()
      };
      
      const res = await apiFetch('/api/library', {
        method: 'POST',
        body: JSON.stringify(qrItem)
      });
      if (res && res.ok) {
        state.collection = await res.json();
        successCount++;
      } else {
        const errData = await res.json();
        console.error('Server sync failed:', errData);
        serverErrors++;
      }
    } catch (err) { 
      console.error('Scan or Sync failed:', err);
      failCount++;
    }
  }

  content.innerHTML = originalHTML;

  if (successCount > 0) {
    let msg = `Success! ${successCount} QR code(s) re-assembled.`;
    if (serverErrors > 0) msg += ` Note: ${serverErrors} sync failures occurred.`;
    
    showNotification(msg, 'success', {
      label: 'View Library',
      callback: () => navigate('library')
    });
    
    // Smooth transition if not already navigating
    setTimeout(() => {
      if (state.activeView !== 'library') navigate('library');
    }, 2000);

  } else if (serverErrors > 0) {
    showNotification(`Detected QR codes, but failed to save them to the cloud library (${serverErrors} error(s)).`, 'error');
    renderScan();
  } else {
    showNotification(`Could not find any clear QR codes in the ${fileArray.length} file(s) provided.`, 'info');
    renderScan();
  }
};

// --- Settings Module ---
const renderSettings = () => {
  const isGoogleUser = !state.user.password;
  const defaults = state.user.settings?.qrStyle || {};

  viewport.innerHTML = `
    <div class="animate-fade-in">
      <h1>Console Settings</h1>
      
      <div class="grid-2" style="margin-top: 2rem;">
        <div class="console-card">
          <div class="card-header">
            <h2>User Profile</h2>
          </div>
          <form id="profile-form" style="display: flex; flex-direction: column; gap: 1rem;">
             <div>
              <label>Full Display Name</label>
              <input type="text" id="set-display-name" value="${state.user.displayName}" required>
            </div>
             <div>
              <label>Email Address</label>
              <input type="email" value="${state.user.email}" disabled style="opacity: 0.6;">
            </div>
            <button type="submit" class="btn-primary" style="margin-top: 1rem;">Save Profile</button>
          </form>
        </div>

        <div class="console-card">
          <div class="card-header">
            <h2>Console Appearance</h2>
          </div>
          <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            <div style="display: flex; gap: 1rem; align-items: center;">
              <input type="color" value="${state.settings.defaultColor}" id="set-color" style="width: 50px; height: 50px; padding: 4px; border-radius: 50%; cursor: pointer;">
              <div>
                <div style="font-weight: 500;">Accent Color</div>
                <div style="font-size: 0.75rem; color: var(--m3-secondary);">System-wide brand color</div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--m3-surface-container); border-radius: 12px;">
              <div>
                <div style="font-weight: 500;">Dark Mode</div>
                <div style="font-size: 0.75rem; color: var(--m3-secondary);">Switch between light and dark themes</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="dark-mode-toggle" ${state.user.settings?.isDarkMode ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
            <div>
              <label>Default Export Format</label>
              <select class="settings-sync" data-key="exportFormat">
                <option value="png" ${state.user.settings?.exportFormat === 'png' ? 'selected' : ''}>PNG (Raster Image)</option>
                <option value="svg" ${state.user.settings?.exportFormat === 'svg' ? 'selected' : ''}>SVG (Vector Image - Pro)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="console-card">
        <div class="card-header">
          <h2>Brand Identity</h2>
          <p style="font-size: 0.8rem; color: var(--m3-secondary);">Upload your logo to embed it into every QR code you generate.</p>
        </div>
        
        <div style="display: flex; gap: 2rem; align-items: flex-start; margin-top: 1.5rem;">
          <div style="width: 120px; height: 120px; border: 2px dashed var(--m3-outline-variant); border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: white;">
            ${state.user.settings?.brandLogo ? `<img src="${state.user.settings.brandLogo}" style="max-width: 100%; max-height: 100%; object-fit: contain;">` : '<span style="font-size: 2rem; opacity: 0.2;">🖼️</span>'}
          </div>
          <div style="flex-grow: 1;">
            <label>Brand Logo (PNG/JPG)</label>
            <input type="file" id="set-logo-input" accept="image/*" style="margin-bottom: 1rem;">
            <p style="font-size: 0.7rem; color: var(--m3-secondary);">Recommended: Transparent PNG, square aspect ratio.</p>
            ${state.user.settings?.brandLogo ? `<button class="btn-ghost" style="color: var(--m3-error); border-color: var(--m3-error); margin-top: 1rem; padding: 4px 12px; font-size: 0.7rem;" id="remove-logo-btn">Remove Logo</button>` : ''}
          </div>
        </div>
      </div>

      <div class="console-card">
        <div class="card-header">
          <h2>QR Global Branding</h2>
          <p style="font-size: 0.8rem; color: var(--m3-secondary);">Automatically apply these styles to all new QR codes you create.</p>
        </div>
        
        <div class="grid-3" style="margin-top: 1.5rem;">
          <div>
            <label>Dot Style</label>
            <select class="settings-sync" data-key="qrStyle.dotType">
              <option value="rounded" ${defaults.dotType === 'rounded' ? 'selected' : ''}>Rounded (Default)</option>
              <option value="dots" ${defaults.dotType === 'dots' ? 'selected' : ''}>Clean Dots</option>
              <option value="classy" ${defaults.dotType === 'classy' ? 'selected' : ''}>Classy</option>
              <option value="square" ${defaults.dotType === 'square' ? 'selected' : ''}>Crisp Square</option>
              <option value="extra-rounded" ${defaults.dotType === 'extra-rounded' ? 'selected' : ''}>Extra Rounded</option>
            </select>
          </div>
          <div>
            <label>Corner Style</label>
            <select class="settings-sync" data-key="qrStyle.cornerType">
              <option value="extra-rounded" ${defaults.cornerType === 'extra-rounded' ? 'selected' : ''}>Rounded Square</option>
              <option value="dot" ${defaults.cornerType === 'dot' ? 'selected' : ''}>Circular</option>
              <option value="square" ${defaults.cornerType === 'square' ? 'selected' : ''}>Sharp Square</option>
            </select>
          </div>
           <div>
            <label>Inner Dot Style</label>
            <select class="settings-sync" data-key="qrStyle.cornerDotType">
              <option value="dot" ${defaults.cornerDotType === 'dot' ? 'selected' : ''}>Circular</option>
              <option value="square" ${defaults.cornerDotType === 'square' ? 'selected' : ''}>Square</option>
            </select>
          </div>
        </div>
      </div>

      <div class="console-card">
        <div class="card-header">
          <h2>Security & Credentials</h2>
        </div>
        
        ${isGoogleUser ? `
          <div style="padding: 1rem; background: var(--m3-surface-container); border-radius: 12px; display: flex; gap: 1rem; align-items: center;">
            <span style="font-size: 1.5rem;">🛡️</span>
            <div>
              <div style="font-weight: 600; font-size: 0.9rem;">Managed by Google</div>
              <p style="font-size: 0.8rem; color: var(--m3-secondary);">Change your password via your <a href="https://myaccount.google.com/security" target="_blank" style="color: var(--m3-primary);">Google Account</a>.</p>
            </div>
          </div>
        ` : `
          <form id="change-password-form" style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 400px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div>
                <label>Current Password</label>
                <input type="password" id="current-password" required>
              </div>
              <div>
                <label>New Password (8+ Chars)</label>
                <input type="password" id="new-password" required minlength="8">
              </div>
            </div>
            <button type="submit" class="btn-ghost" id="save-password-btn" style="width: fit-content;">Verify & Update Password</button>
          </form>
        `}
      </div>

      <div class="console-card" style="border-color: rgba(179, 38, 30, 0.2); background: rgba(179, 38, 30, 0.02); margin-top: 3rem;">
        <div style="font-weight: 600; color: var(--m3-error);">Danger Zone</div>
        <p style="font-size: 0.875rem; color: var(--m3-secondary); margin-top: 0.5rem;">Permanently wipe all cloud data. This action cannot be undone.</p>
        <button class="btn-ghost" style="color: var(--m3-error); border-color: var(--m3-error); margin-top: 1rem;" onclick="alert('Batch delete implemented soon!')">Wipe All Cloud Data</button>
      </div>
    </div>
  `;
  
  initSettingsEvents();
};

const initSettingsEvents = () => {
  // Theme Color
  document.getElementById('set-color')?.addEventListener('change', async (e) => {
    const color = e.target.value;
    state.settings.defaultColor = color;
    document.documentElement.style.setProperty('--m3-primary', color);
    
    await apiFetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ themeColor: color })
    });
    
    // Refresh previews to show new color
    if (state.activeView === 'library') renderLibraryPreviews();
  });

  // Dark Mode
  document.getElementById('dark-mode-toggle')?.addEventListener('change', async (e) => {
    const isDark = e.target.checked;
    document.body.classList.toggle('dark-mode', isDark);
    await apiFetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ isDarkMode: isDark })
    });
  });

  // Profile Form
  document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('set-display-name').value;
    const btn = e.target.querySelector('button');
    btn.innerText = 'Saving...';

    const res = await apiFetch('/api/user', {
      method: 'PATCH',
      body: JSON.stringify({ displayName })
    });
    if (res && res.ok) {
      state.user = await res.json();
      updateSidebarUser();
      showNotification('Profile updated!', 'success');
    }
    btn.innerText = 'Save Profile';
  });

  // QR Branding Sync
  document.querySelectorAll('.settings-sync').forEach(select => {
    select.addEventListener('change', async (e) => {
      const keyPath = e.target.dataset.key;
      const value = e.target.value;
      
      let payload = {};
      if (keyPath === 'qrStyle.dotType') payload.qrStyle = { ...state.user.settings.qrStyle, dotType: value };
      else if (keyPath === 'qrStyle.cornerType') payload.qrStyle = { ...state.user.settings.qrStyle, cornerType: value };
      else if (keyPath === 'qrStyle.cornerDotType') payload.qrStyle = { ...state.user.settings.qrStyle, cornerDotType: value };
      else if (keyPath === 'exportFormat') payload.exportFormat = value;
      
      const res = await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      if (res && res.ok) state.user.settings = await res.json();
    });
  });

  // Logo Upload
  document.getElementById('set-logo-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Logo = event.target.result;
      const res = await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ brandLogo: base64Logo })
      });
      if (res && res.ok) {
        state.user.settings = await res.json();
        renderSettings();
        showNotification('Brand logo updated! 🎨', 'success');
      }
    };
    reader.readAsDataURL(file);
  });

  // Remove Logo
  document.getElementById('remove-logo-btn')?.addEventListener('click', async () => {
    const res = await apiFetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ brandLogo: null })
    });
    if (res && res.ok) {
      state.user.settings = await res.json();
      renderSettings();
      showNotification('Brand logo removed.', 'info');
    }
  });

  // Password Form (Legacy handle)
  document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const res = await apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (res && res.ok) {
      showNotification('Password updated successfully!', 'success');
    } else {
      const data = await res.json();
      showNotification(data.message || 'Password update failed', 'error');
    }
  });
};

// --- OmniSearch (Command Palette) ---
window.showCommandPalette = () => {
  const overlay = document.getElementById('cmd-palette-overlay');
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="cmd-palette-modal" onclick="event.stopPropagation()">
      <div class="cmd-input-wrapper">
        <span>🔍</span>
        <input type="text" id="cmd-search-input" class="cmd-input" placeholder="Search assets, tools, or settings..." autocomplete="off">
      </div>
      <div class="cmd-results" id="cmd-results-list">
        <div style="padding: 2rem; text-align: center; color: var(--m3-secondary); font-size: 0.8rem;">
          Start typing to search your brand portfolio...
        </div>
      </div>
      <div class="cmd-hint">
        <span>Use ↑↓ to navigate</span>
        <span>ESC to close</span>
      </div>
    </div>
  `;

  overlay.classList.add('active');
  const input = document.getElementById('cmd-search-input');
  input.focus();

  input.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const resultsContainer = document.getElementById('cmd-results-list');
    
    if (!term) {
      resultsContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--m3-secondary); font-size: 0.8rem;">Start typing to search...</div>';
      return;
    }

    const filtered = state.collection.filter(item => 
      item.name.toLowerCase().includes(term) || 
      item.type.toLowerCase().includes(term) ||
      item.data.toLowerCase().includes(term)
    );

    const navMatches = [
      { id: 'nav-library', name: 'Go to Library', type: 'NAV', icon: '📚', view: 'library' },
      { id: 'nav-generate', name: 'Go to Generator', type: 'NAV', icon: '🪄', view: 'generate' },
      { id: 'nav-settings', name: 'Go to Settings', type: 'NAV', icon: '⚙️', view: 'settings' }
    ].filter(n => n.name.toLowerCase().includes(term));

    resultsContainer.innerHTML = [
      ...navMatches.map(n => `
        <div class="cmd-item" onclick="window.consoleNavigate('${n.view}'); window.closeCommandPalette();">
          <span style="font-size: 1.2rem;">${n.icon}</span>
          <div class="cmd-item-info">
            <div class="cmd-item-title">${n.name}</div>
            <div class="cmd-item-subtitle">NAVIGATION</div>
          </div>
        </div>
      `),
      ...filtered.map(item => `
        <div class="cmd-item" onclick="window.closeCommandPalette(); window.consoleNavigate('library'); setTimeout(() => window.showQRModal('${item.id}'), 100);">
          <span style="font-size: 1.2rem;">${QR_SCHEMAS[item.type]?.icon || '📦'}</span>
          <div class="cmd-item-info">
            <div class="cmd-item-title">${item.name}</div>
            <div class="cmd-item-subtitle">${item.type} • ${item.data.substring(0, 40)}${item.data.length > 40 ? '...' : ''}</div>
          </div>
        </div>
      `)
    ].join('') || '<div style="padding: 2rem; text-align: center; color: var(--m3-secondary); font-size: 0.8rem;">No matches found.</div>';
  });
};

window.closeCommandPalette = () => {
  const overlay = document.getElementById('cmd-palette-overlay');
  if (overlay) overlay.classList.remove('active');
};

// --- Initialization ---
// Create Overlays
const modalOverlay = document.createElement('div');
modalOverlay.id = 'modal-overlay';
modalOverlay.className = 'modal-overlay';
modalOverlay.onclick = () => window.closeQRModal();
document.body.appendChild(modalOverlay);

const cmdOverlay = document.createElement('div');
cmdOverlay.id = 'cmd-palette-overlay';
cmdOverlay.className = 'cmd-palette-overlay';
cmdOverlay.onclick = () => window.closeCommandPalette();
document.body.appendChild(cmdOverlay);

// Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.closeQRModal();
    window.closeCommandPalette();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    window.showCommandPalette();
  }
});

window.consoleNavigate = navigate; // Global helper
navItems.forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.view));
});

// Perform Auth Check on Load
checkAuth();
