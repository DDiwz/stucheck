/**
 * settings.js — User profile and Theme settings
 */

/* ── Theme Management ───────────────────────────────── */
const Theme = {
  KEY: 'stu_theme',

  apply(themeVal) {
    const val = themeVal || Storage.get(this.KEY, 'light');
    let shouldBeDark = false;

    if (val === 'dark') {
      shouldBeDark = true;
    } else if (val === 'system') {
      shouldBeDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      shouldBeDark = false;
    }

    if (shouldBeDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  },

  set(themeVal) {
    Storage.set(this.KEY, themeVal);
    this.apply(themeVal);
  },

  init() {
    const savedTheme = Storage.get(this.KEY, 'light');
    this.apply(savedTheme);

    const select = document.getElementById('theme-select');
    if (select) {
      select.value = savedTheme;
      select.addEventListener('change', (e) => {
        this.set(e.target.value);
        showToast('เปลี่ยนโหมดการแสดงผลสำเร็จ', 'info');
      });
    }
  }
};

/* ── Init Settings Page ──────────────────────────────── */
function initSettingsPage() {
  const user = Session.require();
  if (!user) return;

  Theme.init();

  const form = document.getElementById('settings-form');
  if (!form) return;

  document.getElementById('username-display').textContent = user.username;
  if (form.displayName) form.displayName.value = user.displayName || '';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = form.displayName.value.trim();

    await Auth.updateProfile({ displayName });
    showToast('บันทึกข้อมูลส่วนตัวเรียบร้อย', 'success');

    const navDisplay = document.getElementById('user-display');
    if (navDisplay) navDisplay.textContent = user.username;
  });
}

// Auto-init theme on all pages
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Storage !== 'undefined') {
    Theme.apply();
  }
});

