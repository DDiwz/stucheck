/**
 * auth.js — Register, Login, Logout for STU-Check
 * Connects to the backend server with persistent JSON storage.
 */

const USERS_KEY = 'stu_users';

const Auth = {
  /* Register a new user via server API. Returns { ok, user, error } */
  async register({ username, password, displayName = '' }) {
    if (!username || !password) return { ok: false, error: 'กรุณากรอกข้อมูลให้ครบ' };
    if (password.length < 8) return { ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' };

    try {
      const res = await fetch(SERVER_CONFIG.api('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'เกิดข้อผิดพลาดในการลงทะเบียน' };
      }
      return { ok: true, user: data.user };
    } catch (err) {
      console.warn('[Auth.register] Server unreachable, fallback error:', err);
      return { ok: false, error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบว่าเซิร์ฟเวอร์กำลังทำงาน' };
    }
  },

  /* Login against server API. Returns { ok, user, error } */
  async login({ username, password }) {
    if (!username || !password) return { ok: false, error: 'กรุณากรอก Username และ Password' };

    try {
      const res = await fetch(SERVER_CONFIG.api('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Username หรือ Password ไม่ถูกต้อง' };
      }
      const sessionUser = { id: data.user.id, username: data.user.username, displayName: data.user.displayName };
      Session.set(sessionUser);
      return { ok: true, user: sessionUser };
    } catch (err) {
      console.warn('[Auth.login] Server unreachable:', err);
      return { ok: false, error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อ' };
    }
  },

  /* Update profile for logged-in user on server */
  async updateProfile({ displayName }) {
    const session = Session.get();
    if (!session) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' };

    try {
      const res = await fetch(SERVER_CONFIG.api('/api/auth/update-profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, displayName })
      });
      const data = await res.json();
      if (data.ok) {
        Session.set({ ...session, displayName: data.user.displayName });
        return { ok: true, user: data.user };
      }
      return { ok: false, error: data.error };
    } catch (err) {
      console.warn('[Auth.updateProfile] Failed:', err);
      Session.set({ ...session, displayName });
      return { ok: true, user: { ...session, displayName } };
    }
  },

  /* Logout */
  logout() {
    Session.clear();
    window.location.href = '/index.html';
  }
};

/* ── Register Page Logic ─────────────────────────────── */
function initRegisterPage() {
  redirectIfLoggedIn();
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const submitBtn   = form.querySelector('button[type="submit"]');
    const origBtnText = submitBtn ? submitBtn.textContent : '';

    const username    = form.username.value.trim();
    const password    = form.password.value;
    const confirmPass = form.confirmPassword.value;
    const displayName = form.displayName ? form.displayName.value.trim() : '';

    if (password !== confirmPass) {
      showFieldError('confirmPassword', 'รหัสผ่านไม่ตรงกัน');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังลงทะเบียน...';
    }

    try {
      const result = await Auth.register({ username, password, displayName });
      if (!result.ok) {
        if (result.error.includes('Username')) showFieldError('username', result.error);
        else if (result.error.includes('รหัสผ่าน')) showFieldError('password', result.error);
        else showToast(result.error, 'error');
        return;
      }
      showToast('สมัครสมาชิกสำเร็จ! กำลังไปหน้าเข้าสู่ระบบ...', 'success');
      setTimeout(() => window.location.href = '/login.html', 1000);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = origBtnText;
      }
    }
  });
}

/* ── Login Page Logic ────────────────────────────────── */
function initLoginPage() {
  redirectIfLoggedIn();
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const submitBtn   = form.querySelector('button[type="submit"]');
    const origBtnText = submitBtn ? submitBtn.textContent : '';

    const username = form.username.value.trim();
    const password = form.password.value;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังตรวจสอบ...';
    }

    try {
      const result = await Auth.login({ username, password });
      if (!result.ok) {
        showToast(result.error, 'error');
        form.password.value = '';
        return;
      }
      showToast('เข้าสู่ระบบสำเร็จ!', 'success');
      setTimeout(() => window.location.href = '/dashboard.html', 800);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = origBtnText;
      }
    }
  });
}

/* ── Field Error Helpers ─────────────────────────────── */
function showFieldError(fieldName, message) {
  const input = document.getElementById(fieldName) || document.querySelector(`[name="${fieldName}"]`);
  const errEl = document.getElementById(`${fieldName}-error`);
  if (input) input.classList.add('error');
  if (errEl) { errEl.textContent = message; errEl.classList.add('show'); }
}

function clearErrors() {
  document.querySelectorAll('.form-input.error').forEach(el => el.classList.remove('error'));
  document.querySelectorAll('.form-error.show').forEach(el => el.classList.remove('show'));
}

/* ── Logout button ───────────────────────────────────── */
document.addEventListener('click', (e) => {
  if (e.target.id === 'logout-btn' || e.target.closest('#logout-btn')) {
    Auth.logout();
  }
});
