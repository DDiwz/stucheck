/**
 * student.js — Student room with MediaPipe FaceMesh emotion detection
 * Privacy-first: only emotion codes (0/1/2/3) are sent over network, never image data.
 * Cross-device sync via Socket.IO.
 */

let studentState = {
  room: null,
  socket: null,
  socketId: null,
  isPaused: false,
  isCollecting: false,
  currentEmotion: null,
  faceMesh: null,
  camera: null,
};

/* Unique ID for this student session (per tab) */
const STUDENT_SID = 'stu_sid_' + generateId().slice(0, 8);

async function initStudentPage() {
  const user = Session.require();
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) { window.location.href = '/dashboard.html'; return; }

  // 1. Get room info from local or server
  let room = Rooms.get(code);
  if (!room) {
    room = await Rooms.fetchRoom(code);
  }
  if (!room) {
    showToast('ไม่พบห้องเรียน อาจถูกปิดแล้ว', 'error');
    setTimeout(() => window.location.href = '/dashboard.html', 2000);
    return;
  }

  studentState.room     = room;
  studentState.socketId = STUDENT_SID;

  // Render room info
  setText('#room-code-val',    room.code);
  setText('#subject-val',      `${room.subjectCode} — ${room.subjectName}`);
  setText('#classroom-val',    room.classroom);
  setText('#host-val',         room.hostUsername);
  setText('#student-name-val', user.displayName || user.username);

  // If room was already collecting
  if (room.isCollecting) {
    studentState.isCollecting = true;
    setCollectingUI(true);
  }

  // 2. Connect to Socket.IO for cross-device sync
  if (typeof io !== 'undefined') {
    const socket = io(SERVER_URL);
    studentState.socket = socket;

    socket.on('connect', () => {
      console.log('[Student] Connected to Socket.IO, joining room:', code);
      socket.emit('join_room', {
        roomCode: code,
        username: user.username,
        displayName: user.displayName || user.username
      }, (res) => {
        if (res && res.ok) {
          if (res.isCollecting) {
            studentState.isCollecting = true;
            setCollectingUI(true);
          }
        } else if (res && !res.ok) {
          showToast(res.error || 'ไม่สามารถเข้าร่วมห้องได้', 'error');
          setTimeout(() => window.location.href = '/dashboard.html', 2000);
        }
      });
    });

    socket.on('collecting_started', () => {
      studentState.isCollecting = true;
      if (studentState.room) studentState.room.isCollecting = true;
      setCollectingUI(true);
      showToast('ครูเริ่มเก็บข้อมูลแล้ว', 'info');
    });

    socket.on('round_complete', () => {
      if (!studentState.isPaused) sendEmotion();
    });

    socket.on('session_ended', () => {
      showToast('ครูจบการเก็บข้อมูลแล้ว', 'warning');
      setTimeout(() => window.location.href = '/dashboard.html', 2000);
    });

    socket.on('host_disconnected', () => {
      showToast('ผู้สอนตัดการเชื่อมต่อ ห้องเรียนถูกปิดแล้ว', 'warning');
      setTimeout(() => window.location.href = '/dashboard.html', 2000);
    });
  }

  // 3. BroadcastChannel fallback for same-device tabs
  Bus.emit('student_joined', {
    roomCode: code,
    username: user.username,
    displayName: user.displayName || user.username,
    socketId: STUDENT_SID
  });

  Bus.on('host_start', ({ roomCode }) => {
    if (roomCode !== code) return;
    studentState.isCollecting = true;
    if (studentState.room) studentState.room.isCollecting = true;
    setCollectingUI(true);
  });

  Bus.on('session_ended', ({ roomCode }) => {
    if (roomCode !== code) return;
    showToast('ครูจบการเก็บข้อมูลแล้ว', 'warning');
    setTimeout(() => window.location.href = '/dashboard.html', 2000);
  });

  Bus.on('round_complete', ({ roomCode }) => {
    if (roomCode !== code) return;
    if (!studentState.isPaused) sendEmotion();
  });

  // Controls
  document.getElementById('pause-btn')?.addEventListener('click', togglePause);
  document.getElementById('leave-btn')?.addEventListener('click', leaveRoom);

  // Init camera + MediaPipe
  initCamera(user);

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    if (studentState.socket) {
      studentState.socket.disconnect();
    }
    Bus.emit('student_left', { roomCode: code, socketId: STUDENT_SID });
  });
}

/* ── Camera + MediaPipe Setup ────────────────────────── */
async function initCamera(user) {
  const videoEl  = document.getElementById('student-video');
  const canvasEl = document.getElementById('overlay-canvas');
  const overlay  = document.getElementById('cam-overlay');

  if (!videoEl || !canvasEl) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false
    });
    videoEl.srcObject = stream;
    await videoEl.play();

    hide(overlay);
    initMediaPipe(videoEl, canvasEl);
  } catch (err) {
    console.warn('Camera error:', err);
    const overlay = document.getElementById('cam-overlay');
    if (overlay) {
      overlay.innerHTML = `
        <div class="cam-overlay-icon">📷</div>
        <div class="cam-overlay-text">ไม่สามารถเปิดกล้องได้<br><small>กรุณาอนุญาตการเข้าถึงกล้อง</small></div>`;
      show(overlay);
    }
  }
}

/* ── MediaPipe FaceMesh ──────────────────────────────── */
function initMediaPipe(videoEl, canvasEl) {
  if (typeof FaceMesh === 'undefined') {
    console.warn('MediaPipe FaceMesh not loaded');
    setEmotionDisplay(1); // Default neutral
    return;
  }

  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults((results) => {
    const ctx = canvasEl.getContext('2d');
    canvasEl.width  = videoEl.videoWidth  || 640;
    canvasEl.height = videoEl.videoHeight || 480;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setEmotionDisplay(3); // No face
      studentState.currentEmotion = 3;
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const emotion = classifyEmotion(landmarks);
    setEmotionDisplay(emotion);
    studentState.currentEmotion = emotion;

    // Draw subtle landmark dots
    drawLandmarks(ctx, landmarks, canvasEl.width, canvasEl.height);
  });

  studentState.faceMesh = faceMesh;

  if (typeof Camera !== 'undefined') {
    const camera = new Camera(videoEl, {
      onFrame: async () => {
        await faceMesh.send({ image: videoEl });
      },
      width: 640,
      height: 480
    });
    camera.start();
    studentState.camera = camera;
  }
}

/* ── Emotion Classification ──────────────────────────── */
function classifyEmotion(landmarks) {
  try {
    // Eye Aspect Ratio (EAR) - tiredness detection
    const rEAR = eyeAspectRatio(landmarks, 33, 133, 159, 145);
    const lEAR = eyeAspectRatio(landmarks, 263, 362, 386, 374);
    const avgEAR = (rEAR + lEAR) / 2;

    // Smile detection via mouth corners vs center lip
    const leftCorner  = landmarks[61];
    const rightCorner = landmarks[291];
    const topLip      = landmarks[13];

    const cornerAvgY = (leftCorner.y + rightCorner.y) / 2;
    const smileRatio = topLip.y - cornerAvgY; // positive = frown, negative = smile

    const EAR_TIRED_THRESHOLD = 0.20;
    const SMILE_THRESHOLD     = -0.005;

    if (avgEAR < EAR_TIRED_THRESHOLD) return 2; // Sad/Tired
    if (smileRatio < SMILE_THRESHOLD) return 0; // Happy
    return 1; // Neutral
  } catch {
    return 1;
  }
}

function eyeAspectRatio(landmarks, outer, inner, top, bottom) {
  const v = Math.abs(landmarks[top].y    - landmarks[bottom].y);
  const h = Math.abs(landmarks[outer].x  - landmarks[inner].x);
  return h === 0 ? 0 : v / h;
}

/* ── Draw subtle overlay dots ────────────────────────── */
function drawLandmarks(ctx, landmarks, w, h) {
  const keyPoints = [33, 133, 159, 145, 263, 362, 386, 374, 61, 291, 13, 14];
  ctx.fillStyle = 'rgba(56,189,248,0.6)';
  keyPoints.forEach(idx => {
    const p = landmarks[idx];
    if (p) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/* ── Send emotion (cross-device via Socket.IO + Bus fallback) ── */
function sendEmotion() {
  if (studentState.isPaused) return;
  const emotion = studentState.currentEmotion ?? 1;

  if (studentState.socket && studentState.room) {
    studentState.socket.emit('submit_emotion', {
      roomCode: studentState.room.code,
      emotion
    });
  }

  Bus.emit('emotion_update', {
    roomCode: studentState.room?.code,
    socketId: STUDENT_SID,
    emotion
  });
}

/* ── Collecting UI ───────────────────────────────────── */
function setCollectingUI(isCollecting) {
  const border    = document.getElementById('cam-border');
  const statusLbl = document.getElementById('cam-status-label');
  if (border) {
    if (isCollecting) border.classList.add('collecting');
    else border.classList.remove('collecting');
  }
  if (statusLbl) {
    statusLbl.textContent = isCollecting
      ? 'กำลังเก็บข้อมูล — ทุก 1 นาที'
      : 'คนสร้างห้องยังไม่ได้เริ่มเก็บข้อมูล';
  }
}

/* ── Set emotion display badge ───────────────────────── */
function setEmotionDisplay(code) {
  const info  = emotionInfo(code);
  const badge = document.getElementById('emotion-badge');
  if (!badge) return;
  badge.textContent = `${info.emoji} ${info.label}`;
  badge.style.color = info.color;
}

/* ── Pause toggle ────────────────────────────────────── */
function togglePause() {
  studentState.isPaused = !studentState.isPaused;

  if (studentState.socket && studentState.room) {
    studentState.socket.emit('toggle_pause', {
      roomCode: studentState.room.code,
      isPaused: studentState.isPaused
    });
  }

  const btn = document.getElementById('pause-btn');
  if (!btn) return;
  if (studentState.isPaused) {
    btn.textContent = '▶ กลับมาเก็บข้อมูล';
    btn.classList.replace('btn-amber', 'btn-secondary');
    showToast('หยุดเก็บข้อมูลชั่วคราว', 'warning');
  } else {
    btn.textContent = '⏸ หยุดเก็บข้อมูล';
    btn.classList.replace('btn-secondary', 'btn-amber');
    showToast('กลับมาเก็บข้อมูลแล้ว', 'success');
  }
}

/* ── Leave room ──────────────────────────────────────── */
function leaveRoom() {
  if (!confirm('ต้องการออกจากห้องใช่ไหม? ข้อมูลของคุณจะไม่ถูกบันทึก')) return;
  if (studentState.socket) {
    studentState.socket.disconnect();
  }
  Bus.emit('student_left', { roomCode: studentState.room?.code, socketId: STUDENT_SID });
  window.location.href = '/dashboard.html';
}
