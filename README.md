# OmniQR Enterprise Console

A professional, high-fidelity QR Asset Management platform designed for industrial-grade engineering environments. OmniQR transforms static QR codes into dynamic, analytics-ready cloud assets with premium feedback systems.

## 🚀 Quick Start

### 1. Backend Engine
```bash
cd server
cp .env.example .env # Add your MONGODB_URI and JWT_SECRET
npm install
npm run dev # Runs on http://localhost:3000
```

### 2. Frontend Console
```bash
cd client
npm install
npm run dev # Runs on http://localhost:5173 (Proxied to :3000)
```

---

## 💎 Elite Engineering Features

- **Titanium Notifications**: A custom, promise-based feedback system featuring progress timers, manual dismissal, and high-density glassmorphism.
- **Smart Cloud Assets**: Seamlessly host PDFs, PNGs, and JPGs. Files are automatically served through a unified origin with authenticated redirection.
- **Dynamic Handshake Telemetry**: Real-time server-side tracking (`[📡 SYNC]`) of origins, session IDs, and authentication status.
- **Unified Proxy Architecture**: A Vite-powered proxy bridge that eliminates CORS complexity and ensures 100% session persistence.
- **Bionic QR Processor**: High-speed QR scanning and image rectification powered by `jsQR` and custom filtering.

## 🏛️ Project Architecture

```
OmniQR/
├── client/              # Vite + Material 3 CSS + Vanilla JS
│   ├── src/
│   │   ├── main.js      # Console Logic & State Management
│   │   ├── generator-types.js # Asset Schemas (PDF/Images/Social)
│   │   └── style.css    # Titanium Design Tokens
│   └── vite.config.js   # Unified Origin Proxy Configuration
└── server/              # Node.js + Express + MongoDB
    ├── server.js        # Redirection Engine & Auth Handshake
    ├── models/          # User & Asset Schemas
    ├── config/          # Passport (Google/Local) Strategies
    └── uploads/         # Grounded Cloud Asset Storage
```

## 🔐 Enterprise Connectivity

OmniQR is built with a **Sync-First** philosophy. Every interaction is monitored by a visual **🟢 Cloud Synced** indicator in the console sidebar, ensuring that your authenticated session is always alive during high-stakes asset uploads.

---
See [ROADMAP.md](./ROADMAP.md) for the expansion into advanced social tracking and batch processing.
