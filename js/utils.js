/**
 * utils.js — Shared helper utilities for STU-Check
 */

/* ── Toast Notifications ─────────────────────────────── */
(function initToastContainer() {
  if (!document.getElementById('toast-container')) {
    const div = document.createElement('div');
    div.id = 'toast-container';
    document.body.appendChild(div);
  }
})();

function showToast(message, type = 'default', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ── Storage Helpers ─────────────────────────────────── */
const Storage = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } 
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  remove(key) { localStorage.removeItem(key); },
  update(key, updater, fallback = {}) {
    const current = this.get(key, fallback);
    const updated = updater(current);
    this.set(key, updated);
    return updated;
  }
};

/* ── Session (logged-in user) ────────────────────────── */
const Session = {
  KEY: 'stu_session',
  get() { return Storage.get(this.KEY); },
  set(user) { Storage.set(this.KEY, user); },
  clear() { Storage.remove(this.KEY); },
  require() {
    const user = this.get();
    if (!user) { window.location.href = (\$2 => \$2.split('/').slice(0,-1).join('/') || '.')(window.location.pathname) + '/\login.html'; return null; }
    return user;
  }
};

/* ── Room Code Generator ─────────────────────────────── */
function generateRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/* ── Time Formatting ─────────────────────────────────── */
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return iso; }
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

/* ── Sorting (spec: number → ก-ฮ → A-Z) ─────────────── */
function sortParticipants(list) {
  return [...list].sort((a, b) => {
    const na = a.displayName || a.username;
    const nb = b.displayName || b.username;
    const numA = parseInt(na.match(/^\d+/)?.[0] ?? 'NaN');
    const numB = parseInt(nb.match(/^\d+/)?.[0] ?? 'NaN');
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return na.localeCompare(nb, ['th', 'en'], { sensitivity: 'base' });
  });
}

/* ── Emotion Helpers ─────────────────────────────────── */
const EMOTIONS = {
  0: { label: 'Happy',     emoji: '😊', color: 'var(--emerald)', barColor: '#10B981' },
  1: { label: 'Neutral',   emoji: '😐', color: 'var(--text-2)',  barColor: '#94A3B8' },
  2: { label: 'Sad/Tired', emoji: '😔', color: 'var(--amber-500)', barColor: '#F59E0B' },
  3: { label: 'No face',   emoji: '🚫', color: 'var(--slate-300)', barColor: '#CBD5E1' }
};

function emotionInfo(code) {
  return EMOTIONS[code] ?? EMOTIONS[1];
}

function calcAverageEmotion(participants) {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  let total = 0;
  for (const p of participants) {
    if (p.emotion !== null && p.emotion !== undefined) {
      counts[p.emotion] = (counts[p.emotion] || 0) + 1;
      total++;
    }
  }
  if (total === 0) return { dominant: 1, counts, total, percentages: { 0:0,1:0,2:0,3:0 } };
  const pct = {};
  for (const k in counts) pct[k] = Math.round((counts[k] / total) * 100);
  const dominant = parseInt(Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0]);
  return { dominant, counts, total, percentages: pct };
}

/* ── UUID ────────────────────────────────────────────── */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ── Guard (redirect if logged in) ──────────────────── */
function redirectIfLoggedIn(dest = '/dashboard.html') {
  if (Session.get()) window.location.href = dest;
}

/* ── DOM Helpers ─────────────────────────────────────── */
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }
function show(el) { if(el) el.classList.remove('hidden'); }
function hide(el) { if(el) el.classList.add('hidden'); }
function setHTML(sel, html) { const el = $(sel); if(el) el.innerHTML = html; }
function setText(sel, text) { const el = $(sel); if(el) el.textContent = text; }
