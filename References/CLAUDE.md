# OmniQR: Developer Guidelines (CLAUDE.md)

Developer-focused commands and operational standards for the OmniQR platform.

## 🛠️ Build & Development Commands

### Full Environment Setup
```bash
# Terminal 1: Server
cd server && npm install && npm run dev

# Terminal 2: Client
cd client && npm install && npm run dev
```

### Build Commands
```bash
# Client Production Build
cd client && npm run build

# Preview Production Build
cd client && npm run preview
```

## 🏗️ Technical Architecture Standards

### Unified Origin Proxy
OmniQR uses a **Vite proxy** to unify the frontend and backend origins. 
- **Vite (Port 5173)**: Handles all UI rendering and proxies `/api`, `/auth`, and `/uploads` to the backend.
- **Express (Port 3000)**: Serves the API and handles the "Smart Asset" file system.

> [!IMPORTANT]
> **NEVER HARDCODE URLS**: Always use relative paths (e.g., `/api/user`) in the frontend. The `API_URL` constant should remain an empty string (`''`) in development to leverage the proxy's session-sharing capabilities.

## 🎨 Code Style & Patterns

- **State Management**: Use the global `state` object in `main.js`. Mutate state and call the relevant `render[View]()` function immediately.
- **Notifications**: Use `window.showNotification(message, type, actions)` for all user feedback. Avoid native `alert()` or `confirm()`.
- **Async Strategy**: All API calls must use the `apiFetch` wrapper to auto-refresh the **Sync Status** and handle session timeouts (401 errors).
- **Paths**: Use absolute path grounding (`path.join(__dirname, '...')`) on the server for all file system operations (specifically for the `/uploads` directory).

## 🧪 Quick Smoke Test
- Ensure sidebar shows **● Cloud Synced**.
- Verify "Smart Cloud Asset" allows select and upload of both PDFs and PNGs.
- Confirm QR Code styling updates reflects real-time changes in the generator preview.
