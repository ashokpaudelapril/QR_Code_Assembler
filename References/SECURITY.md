# OmniQR: Security & Connectivity (SECURITY.md)

Guidelines on how OmniQR maintains asset integrity and authenticated synchronization.

## 🌉 The Unified Origin Model

OmniQR uses a **Single-Origin Proxy** bridge to handle the "Two-Hose" problem (Frontend at 5173, Backend at 3000).

- **Vite Proxy**: All frontend requests are sent to `/api` or `/auth` on the same host. Vite transparently forwards these to the server.
- **Session Sharing**: Because the browser thinks it's talking to a single origin, session cookies are sent and received reliably, preventing "Unauthorized" triggers during complex multi-part uploads.

## 🔐 Session Hardening

- **Trust Proxy**: The server is configured with `app.set('trust proxy', 1)`, allowing it to correctly identify clients behind the Vite development proxy.
- **Secure Cookies**:
  - `httpOnly: true`: Prevents client-side scripts from reading session tokens.
  - `sameSite: 'lax'`: Ensures cookies are sent during common navigation while protecting against CSRF.
  - `secure: false`: Currently set to false for local development over HTTP but can be toggled for production SSL.

## 📥 Asset Protection

- **Mimetype Filtering**: Multer is restricted to `application/pdf`, `image/png`, and `image/jpeg`. All other files are rejected at the gate.
- **Identity-Locked Generation**: Only authenticated users can generate or update Smart Assets linked to their account.
- **Absolute Pathing**: Grounding storage in `__dirname` prevents directory traversal risks or path resolution failures.

## 📡 Diagnostic Handshake

Every request is scanned by the **Deep Diagnostic Logger**:
- Monitors `Origin` vs `Host`.
- Tracks `SessionID` persistence.
- Validates `Auth` state per-request to ensure no unauthorized data leakage.
