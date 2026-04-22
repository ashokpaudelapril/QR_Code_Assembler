# OmniQR: Known Issues & Limits (BUGS.md)

Documentation of current functional limits and identified edge cases in the OmniQR platform.

## 🛑 Current Technical Limits

1.  **File Size Maximum**: Smart Cloud Assets are capped at **10MB**. Uploads larger than this will trigger a [413 Payload Too Large] error from the proxy.
2.  **Mimetype Restrict**: Only `.pdf`, `.png`, and `.jpg` / `.jpeg` are supported. SVG and other vector formats are currently rejected by the Multer validator.
3.  **Local Dev Ports**: The console *requires* the client to be on `:5173` and server on `:3000` to maintain the proxy handshake. Custom ports may break session persistence.
4.  **Google OAuth Callback**: The current callback is hardcoded for `localhost:5173`. Moving to a production domain requires updating the `PASSPORT_CALLBACK` environment variable.

## 🟠 Known Edge Cases

- **Mobile Camera Zoom**: On certain Android devices, the `jsQR` scanner may struggle with focus in extreme low-light environments.
- **Vite Restart Required**: After editing `vite.config.js`, the user MUST manually restart the dev server. The console logic cannot auto-refresh the proxy bridge.
- **Empty Library State**: The dashboard charts currently display a "portfolio analysis" message if noassets have been generated; this is intentional but could be mistaken for a data load error.

---
To report a new bug, please provide the server-side `[📡 SYNC]` output from the time of failure.
