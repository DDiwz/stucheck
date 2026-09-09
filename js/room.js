/**
 * room.js — Room creation, joining, and cross-device sync
 * Works in two modes:
 *   ONLINE:  connected to Node.js/Socket.IO server across devices
 *   OFFLINE: BroadcastChannel fallback (same machine, different tabs)
 */

const ROOMS_KEY    = 'stu_rooms';
const ROOM_SESSION = 'stu_active_room';
// SERVER_URL is now driven by SERVER_CONFIG (defined in js/config.js)
const SERVER_URL = (typeof SERVER_CONFIG !== 'undefined') ? SERVER_CONFIG.socketUrl : window.location.origin;

const Rooms = {
  getAll()        { return Storage.get(ROOMS_KEY, {}); },
  get(code)       { return this.getAll()[code] ?? null; },
  set(code, data) { Storage.update(ROOMS_KEY, r => ({ ...r, [code]: data })); },
  remove(code)    { Storage.update(ROOMS_KEY, r => { const c = {...r}; delete c[code]; return c; }); },

  async fetchRoom(code) {
    try {
      const res = await fetch(SERVER_CONFIG.api(`/api/rooms/${encodeURIComponent(code)}`));
      const data = await res.json();
      if (data.ok && data.room) {
        this.set(code, data.room);
        return data.room;
      }
    } catch (err) {
      console.warn('[Rooms.fetchRoom] Failed:', err);
    }
    return this.get(code);
  },

  create({ hostId, hostUsername, subjectCode, subjectName, classroom }) {
    const code = generateRoomCode();
    const room = {
      code, hostId, hostUsername, subjectCode, subjectName, classroom,
      createdAt: new Date().toISOString(),
      isCollecting: false,
      collectionStartTime: null,
      roundCount: 0,
      participants: {},
      roundHistory: []
    };
    this.set(code, room);
    return room;
  },

  addParticipant(code, socketId, { username, displayName }) {
    const room = this.get(code);
    if (!room) return false;
    if (!room.participants) room.participants = {};
    room.participants[socketId] = {
      username,
      displayName: displayName || username,
      emotion: null,
      isPaused: false,
      joinTime: new Date().toISOString()
    };
    this.set(code, room);
    return true;
  },

  removeParticipant(code, socketId) {
    const room = this.get(code);
    if (!room || !room.participants) return;
    delete room.participants[socketId];
    this.set(code, room);
  },

  updateEmotion(code, socketId, emotion) {
    const room = this.get(code);
    if (!room || !room.participants || !room.participants[socketId]) return;
    room.participants[socketId].emotion = emotion;
    this.set(code, room);
  },

  setCollecting(code, value) {
    const room = this.get(code);
    if (!room) return;
    room.isCollecting = value;
    if (value) room.collectionStartTime = new Date().toISOString();
    this.set(code, room);
  },

  incrementRound(code) {
    const room = this.get(code);
    if (!room) return;
    room.roundCount = (room.roundCount || 0) + 1;
    const snapshot = {
      round: room.roundCount,
      time: new Date().toISOString(),
      data: Object.values(room.participants || {}).map(p => ({
        username: p.username,
        displayName: p.displayName,
        emotion: p.emotion
      }))
    };
    if (!room.roundHistory) room.roundHistory = [];
    room.roundHistory.push(snapshot);
    this.set(code, room);
    return snapshot;
  },

  participantList(code) {
    const room = this.get(code);
    if (!room || !room.participants) return [];
    return sortParticipants(Object.values(room.participants));
  }
};

/* ── BroadcastChannel Bus (Fallback) ─────────────────── */
const Bus = {
  _ch: null,
  _handlers: {},

  init() {
    if (!window.BroadcastChannel) return;
    this._ch = new BroadcastChannel('stu-check-bus');
    this._ch.onmessage = (e) => {
      const { type, payload } = e.data;
      (this._handlers[type] || []).forEach(fn => fn(payload));
    };
  },

  on(type, fn) {
    if (!this._handlers[type]) this._handlers[type] = [];
    this._handlers[type].push(fn);
  },

  emit(type, payload) {
    if (this._ch) this._ch.postMessage({ type, payload });
  },

  destroy() {
    if (this._ch) { this._ch.close(); this._ch = null; }
    this._handlers = {};
  }
};

Bus.init();

/* ── Create Room Page ────────────────────────────────── */
function initCreateRoomPage() {
  const user = Session.require();
  if (!user) return;

  const form = document.getElementById('create-room-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const subjectCode = form.subjectCode.value.trim();
    const subjectName = form.subjectName.value.trim();
    const classroom   = form.classroom.value.trim();

    if (!subjectCode || !subjectName || !classroom) {
      showToast('กรุณากรอกข้อมูลให้ครบทุกช่อง', 'error');
      return;
    }

    const room = Rooms.create({
      hostId: user.id,
      hostUsername: user.username,
      subjectCode, subjectName, classroom
    });

    Storage.set(ROOM_SESSION, { role: 'host', roomCode: room.code });
    window.location.href = `/host-room.html?code=${room.code}`;
  });
}

/* ── Join Room Page ──────────────────────────────────── */
function initJoinRoomPage() {
  const user = Session.require();
  if (!user) return;

  const privacyModal = document.getElementById('privacy-modal');
  const acceptBtn    = document.getElementById('accept-privacy-btn');
  const form         = document.getElementById('join-room-form');
  let   pendingCode  = null;

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = (form.roomCode.value || '').trim().replace(/\s/g, '');
    if (code.length !== 6 || isNaN(code)) {
      showToast('รหัสห้องต้องเป็นตัวเลข 6 หลัก', 'error');
      return;
    }

    // Try finding room locally or from server
    let room = Rooms.get(code);
    if (!room) {
      room = await Rooms.fetchRoom(code);
    }

    if (!room) {
      showToast('ไม่พบรหัสห้องนี้ กรุณาตรวจสอบอีกครั้ง', 'error');
      return;
    }

    pendingCode = code;
    if (privacyModal) privacyModal.classList.add('show');
  });

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      if (!pendingCode) return;
      Storage.set(ROOM_SESSION, { role: 'student', roomCode: pendingCode });
      window.location.href = `/student-room.html?code=${pendingCode}`;
    });
  }

  const cancelBtn = document.getElementById('cancel-privacy-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      privacyModal?.classList.remove('show');
      pendingCode = null;
    });
  }

  // Format code input
  const codeInput = document.getElementById('roomCode') || form.querySelector('input[name="roomCode"]');
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    });
  }
}
