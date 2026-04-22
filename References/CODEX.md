# OmniQR: The Titanium Design System (CODEX.md)

Guidelines for the visual and logic patterns that power the OmniQR Enterprise Suite.

## 🎨 Visual Language: Poly-Glassmorphism

OmniQR uses a 4px-based design system optimized for high-density engineering environments.

### Core Color Tokens
- **Titanium Primary**: `#0B57D0` (Material 3 Digital Blue)
- **Titanium Surface**: `rgba(255, 255, 255, 0.7)` with `backdrop-filter: blur(20px)`
- **Titanium Success**: `#4CAF50` (Console Green)
- **Titanium Error**: `#B3261E` (Warning Red)

### Layout Rules
- **Viewport**: Fixed (100vh). No body-level scrolling.
- **Glassmorphism**: Every floating element (toasts, modals) must use `backdrop-filter` and translucent borders.
- **Micro-Animations**: All UI transitions use a `cubic-bezier(0.175, 0.885, 0.32, 1.275)` timing for a professional, "bouncy" feel.

---

## 🏗️ Technical Patterns

### 1. Promise-Based Notifications
We've unified all user feedback through `window.showNotification`.
- **Progress Bar logic**: Toast timers are hard-synced to the `transition-duration` of their internal progress bars.
- **Multi-Action support**: Notifications can accept an array of action buttons (e.g., Confirm/Cancel).

### 2. Smart Asset Handshake
Asset uploads (Images/PDFs) follow a strict 3-stage handshake:
1.  **Selection**: Client-side mimetype filtering and preview generation.
2.  **Telemetry Upload**: Multipart POST to `/api/upload-doc` with authenticated credentials.
3.  **Asset Conversion**: Conversion of the returned relative path into a Dynamic QR signature.

### 3. Redirection Engine
Public links follow the `/q/:id` path.
- **Passive Logging**: Scans are logged *before* the 302 redirect.
- **Seamless Fallback**: If an asset is missing, the engine redirects to the platform root (`/`) to maintain an active user loop.

---

## 🛠️ Logic Conventions

- **State Sync**: The sidebar **● Cloud Synced** indicator is the source of truth for connection health.
- **API Wrapper**: Use `apiFetch` for all JSON interactions. It handles the 401 (Unauthorized) catch and auto-refreshes the sync status.
- **Component Lifecycle**: Views are wiped and re-injected into the `#viewport` div. All event listeners are attached post-injection.
