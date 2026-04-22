# OmniQR: Development Log (DEVLOG.md)

Chronological record of the engineering milestones and critical fixes for the OmniQR platform.

## 📅 2026-04-20: Stabilization & Handshake Unification

### 🚀 Major Feature: Smart Cloud Assets (Multi-Media)
- Expanded the asset hosting system to support **PNG, JPG, and JPEG** images alongside PDFs.
- Rebranded the "PDF Document" generator to a more versatile "Smart Cloud Asset" portal.
- Implemented intelligent icon switching (🖼️ vs 📄) based on file mimetype.

### 🛡️ Critical Fix: Connectivity & Auth Bridge
- **Vite Proxy Implementation**: Unified the frontend (5173) and backend (3000) origins to solve persistent CORS-related session failures.
- **Trust Proxy & Session Hardening**: Added `app.set('trust proxy', 1)` and modernized cookie policies (`SameSite: Lax`, `HttpOnly`) for robust persistence.
- **Absolute Path Grounding**: Updated `multer` to use `__dirname` for asset storage, ensuring reliability across different terminal startup contexts.
- **Deep Telemetry**: Added `[📡 SYNC]` logger to monitor every request's origin, session ID, and auth status.

### 💎 UX Upgrade: Titanium Notifications
- Purged all legacy browser `alert()` and `confirm()` calls.
- Implemented a custom promise-based toast system with progress bars, glassmorphism, and high-density animations.

## 📅 2026-04-19: Console Identity Shift
- Transitioned project identity from "QR Assembler" to "OmniQR Enterprise Console".
- Implemented the Material 3 design system with console-card architecture and fixed-viewport navigation.
- Established basic Dynamic Redirection logic (`/q/:id`) with scan logging.
