/**
 * host.js — Host live dashboard logic
 * Manages timer, participant list, emotion aggregation, controls, and Socket.IO cross-device sync.
 */

const COLLECTION_INTERVAL = 60; // seconds per round

let hostState = {
  room: null,
  socket: null,
  sessionStart: null,
  isCollecting: false,
  collectingStart: null,
  elapsed: 0,
  countdown: COLLECTION_INTERVAL,
  elapsedTimer: null,
  countdownTimer: null,
};

function initHostPage() {
  const user = Session.require();
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) { window.location.href = (\$2 => \$2.split('/').slice(0,-1).join('/') || '.')(window.location.pathname) + '/\dashboard.html'; return; }

  const room = Rooms.get(code);
  if (!room || room.hostId !== user.id) {
    showToast('ไม่พบห้องหรือคุณไม่ใช่เจ้าของห้อง', 'error');
    setTimeout(() => window.location.href = (\$2 => \$2.split('/').slice(0,-1).join('/') || '.')(window.location.pathname) + '/\dashboard.html', 2000);
    return;
  }

  hostState.room = room;
  hostState.sessionStart = new Date();

  // Render initial UI
  renderRoomInfo(room);
  startElapsedTimer();
  renderParticipants();
  renderAverageEmotion([]);
  setCollectingUI(false);

  // 1. Setup Socket.IO for cross-device sync
  if (typeof io !== 'undefined') {
    const socket = io(SERVER_URL);
    hostState.socket = socket;

    socket.on('connect', () => {
      console.log('[Host] Connected to Socket.IO server, registering room:', code);
      socket.emit('create_room', {
        roomCode: code,
        hostId: user.id,
        hostUsername: user.username,
        subjectCode: room.subjectCode,
        subjectName: room.subjectName,
        classroom: room.classroom
      });
    });

    socket.on('participants_updated', ({ participants, joinedUser }) => {
      if (Array.isArray(participants)) {
        const curRoom = Rooms.get(code) || hostState.room;
        if (curRoom) {
          curRoom.participants = {};
          participants.forEach(p => {
            curRoom.participants[p.socketId] = p;
          });
          Rooms.set(code, curRoom);
        }
      }
      renderParticipants();
      renderAverageEmotion(Rooms.participantList(code));
      if (joinedUser) {
        showToast(`${joinedUser.displayName || joinedUser.username} เข้าร่วมห้องแล้ว`, 'success');
      }
    });
  }

  // 2. BroadcastChannel fallback for same-device tabs
  Bus.on('student_joined', ({ roomCode, username, displayName, socketId }) => {
    if (roomCode !== code) return;
    Rooms.addParticipant(code, socketId, { username, displayName });
    renderParticipants();
    showToast(`${displayName || username} เข้าร่วมห้องแล้ว`, 'success');
  });

  Bus.on('student_left', ({ roomCode, socketId }) => {
    if (roomCode !== code) return;
    Rooms.removeParticipant(code, socketId);
    renderParticipants();
  });

  Bus.on('emotion_update', ({ roomCode, socketId, emotion }) => {
    if (roomCode !== code) return;
    Rooms.updateEmotion(code, socketId, emotion);
    renderParticipants();
    renderAverageEmotion(Rooms.participantList(code));
  });

  // Controls
  document.getElementById('start-btn')?.addEventListener('click', startCollecting);
  document.getElementById('end-btn')?.addEventListener('click', endSession);
  document.getElementById('export-btn')?.addEventListener('click', () => {
    const fresh = Rooms.get(code);
    if (fresh) History.exportRoom(fresh);
  });
}

/* ── Elapsed Timer ───────────────────────────────────── */
function startElapsedTimer() {
  hostState.elapsedTimer = setInterval(() => {
    hostState.elapsed = Math.floor((new Date() - hostState.sessionStart) / 1000);
    const m = Math.floor(hostState.elapsed / 60);
    const s = hostState.elapsed % 60;
    setText('#elapsed-time', `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
  }, 1000);
}

/* ── Start Collecting ────────────────────────────────── */
function startCollecting() {
  const code = hostState.room.code;
  Rooms.setCollecting(code, true);
  hostState.isCollecting = true;
  hostState.collectingStart = new Date();
  hostState.countdown = COLLECTION_INTERVAL;
  setCollectingUI(true);

  if (hostState.socket) {
    hostState.socket.emit('start_collecting', { roomCode: code });
  }
  Bus.emit('host_start', { roomCode: code });

  hostState.countdownTimer = setInterval(() => {
    hostState.countdown--;
    setText('#countdown-num', String(hostState.countdown));

    if (hostState.countdown <= 0) {
      // Snapshot this round
      const snapshot = Rooms.incrementRound(code);
      hostState.room = Rooms.get(code);
      setText('#round-count', String(hostState.room.roundCount));

      if (hostState.socket) {
        hostState.socket.emit('round_snapshot', { roomCode: code });
      }
      Bus.emit('round_complete', { roomCode: code, round: hostState.room.roundCount });
      hostState.countdown = COLLECTION_INTERVAL;
    }
  }, 1000);

  document.getElementById('start-btn')?.setAttribute('disabled', true);
}

/* ── End Session ─────────────────────────────────────── */
function endSession() {
  if (!confirm('ต้องการจบการเก็บข้อมูลและล้างข้อมูลห้องใช่ไหม?')) return;
  clearInterval(hostState.elapsedTimer);
  clearInterval(hostState.countdownTimer);

  const code = hostState.room.code;
  const room = Rooms.get(code) || hostState.room;
  const participants = Rooms.participantList(code);
  const emotionSummary = calcAverageEmotion(participants);

  const sessionSummary = {
    subjectCode:      room.subjectCode,
    subjectName:      room.subjectName,
    classroom:        room.classroom,
    roomCode:         code,
    startTime:        room.createdAt,
    endTime:          new Date().toISOString(),
    rounds:           room.roundCount,
    participantCount: participants.length,
    emotionSummary,
    roundHistory:     room.roundHistory || []
  };

  // Save to history (both server and local)
  History.add(sessionSummary);

  if (hostState.socket) {
    hostState.socket.emit('end_session', { roomCode: code, sessionSummary });
  }
  Bus.emit('session_ended', { roomCode: code });
  Rooms.remove(code);

  showToast('จบการเก็บข้อมูลแล้ว บันทึกประวัติเรียบร้อย', 'success');
  setTimeout(() => window.location.href = (\$2 => \$2.split('/').slice(0,-1).join('/') || '.')(window.location.pathname) + '/\dashboard.html', 1500);
}

/* ── UI Renderers ────────────────────────────────────── */
function renderRoomInfo(room) {
  setText('#room-code-display', room.code);
  setText('#room-subject',      `${room.subjectCode} — ${room.subjectName}`);
  setText('#room-classroom',    room.classroom);
  setText('#room-host',         room.hostUsername);
}

function setCollectingUI(isCollecting) {
  const badge = document.getElementById('collecting-badge');
  const timer = document.getElementById('countdown-timer');
  const empty = document.getElementById('emotion-empty');
  const bars  = document.getElementById('emotion-bars');

  if (isCollecting) {
    if (badge) { badge.textContent = '● กำลังเก็บข้อมูล'; badge.className = 'badge badge-success'; }
    if (timer) timer.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (bars)  bars.style.display  = 'flex';
  } else {
    if (badge) { badge.textContent = '○ รอเริ่มเก็บข้อมูล'; badge.className = 'badge badge-slate'; }
    if (timer) timer.style.display = 'none';
    if (empty) empty.style.display = 'block';
    if (bars)  bars.style.display  = 'none';
  }
}

function renderParticipants() {
  const listEl  = document.getElementById('participant-list');
  const countEl = document.getElementById('participant-count');
  if (!listEl) return;

  const participants = Rooms.participantList(hostState.room.code);
  if (countEl) countEl.textContent = String(participants.length);

  if (participants.length === 0) {
    listEl.innerHTML = '<li class="participant-empty">ยังไม่มีนักเรียนเข้าร่วม</li>';
    return;
  }

  listEl.innerHTML = participants.map((p, idx) => {
    const emo = p.emotion !== null && p.emotion !== undefined ? emotionInfo(p.emotion) : null;
    const name = p.displayName || p.username;
    return `
      <li class="participant-item">
        <span class="participant-num">${idx + 1}</span>
        <span class="participant-name">${name}</span>
        <span class="participant-status">
          ${p.isPaused ? '<span class="badge badge-amber" style="font-size:0.75rem">หยุดชั่วคราว</span>' : ''}
          ${emo ? `<span style="font-size:1.1rem" title="${emo.label}">${emo.emoji}</span>` : '<span style="color:var(--slate-400);font-size:0.8rem">รอข้อมูล</span>'}
        </span>
      </li>`;
  }).join('');
}

function renderAverageEmotion(participants) {
  const summary = calcAverageEmotion(participants);
  setText('#emo-happy-pct',   `${summary.percentages[0]}%`);
  setText('#emo-neutral-pct', `${summary.percentages[1]}%`);
  setText('#emo-sad-pct',     `${summary.percentages[2]}%`);
  setText('#emo-noface-pct',  `${summary.percentages[3]}%`);

  setBarWidth('#emo-happy-bar',   summary.percentages[0]);
  setBarWidth('#emo-neutral-bar', summary.percentages[1]);
  setBarWidth('#emo-sad-bar',     summary.percentages[2]);
  setBarWidth('#emo-noface-bar',  summary.percentages[3]);

  const dom = emotionInfo(summary.dominant);
  setText('#dominant-emoji', dom.emoji);
  setText('#dominant-label', dom.label);
}

function calcAverageEmotion(participants) {
  const total = participants.length;
  if (total === 0) return { percentages: [0,0,0,0], dominant: 1 };

  const counts = [0, 0, 0, 0]; // [happy, neutral, sad, noface]
  participants.forEach(p => {
    if (p.emotion !== null && p.emotion !== undefined && p.emotion >= 0 && p.emotion <= 3) {
      counts[p.emotion]++;
    } else {
      counts[1]++; // default neutral if not yet reported
    }
  });

  const percentages = counts.map(c => Math.round((c / total) * 100));
  const dominant = counts.indexOf(Math.max(...counts));
  return { percentages, dominant };
}

function setBarWidth(sel, pct) {
  const el = document.querySelector(sel);
  if (el) el.style.width = `${pct}%`;
}
