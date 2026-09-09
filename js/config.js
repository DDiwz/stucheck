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

const BACKEND_URL = 'https://stucheck-api.onrender.com';

/**
 * BASE_PATH — auto-detects the subfolder prefix.
 * - On http://localhost:3000/           → BASE_PATH = ''
 * - On https://ddiwz.github.io/stucheck → BASE_PATH = '/stucheck'
 * Usage: window.location.href = BASE_PATH + '/login.html';
 */
const _segments = window.location.pathname.split('/').filter(Boolean);
// If first segment looks like a repo name (not an .html file), use it as base
const BASE_PATH = (_segments.length > 0 && !_segments[0].includes('.'))
  ? '/' + _segments[0]
  : '';

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
window.BASE_PATH = BASE_PATH;
