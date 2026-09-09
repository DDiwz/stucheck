/**
 * config.js — STU-Check frontend configuration
 *
 * LOCAL DEV:  leave BACKEND_URL as empty string ''
 *             → uses same origin (http://localhost:3000)
 *
 * PRODUCTION: set BACKEND_URL to your Render.com URL
 *             → 'https://stu-check-server.onrender.com'
 *
 * To switch to production mode, change the line below:
 *   const BACKEND_URL = 'https://your-render-url.onrender.com';
 */

const BACKEND_URL = '';   // ← change this when deploying to GitHub Pages

const SERVER_CONFIG = {
  /**
   * Base URL for all REST API calls.
   * Empty string = same origin (works for local dev).
   */
  apiBase: BACKEND_URL,

  /**
   * Socket.IO connection URL.
   * Empty string = auto-detect from current page (works for local dev).
   */
  socketUrl: BACKEND_URL || window.location.origin,

  /**
   * Build a full API path.
   * Usage: SERVER_CONFIG.api('/api/auth/login')
   */
  api(path) {
    return this.apiBase + path;
  }
};

// Make available globally
window.SERVER_CONFIG = SERVER_CONFIG;
