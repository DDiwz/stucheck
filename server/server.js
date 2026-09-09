/**
 * server.js — STU-Check Node.js + Express + Socket.IO server
 * Database: MongoDB Atlas via Mongoose
 * Auth:     bcryptjs password hashing
 * Deploy:   Render.com (backend) + GitHub Pages (frontend)
 */

require('dotenv').config();

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const os       = require('os');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const User    = require('./models/User');
const History = require('./models/History');

const app    = express();
const server = http.createServer(app);

/* ── Environment variables ────────────────────────────── */
const PORT         = process.env.PORT || 3000;
const MONGODB_URI  = process.env.MONGODB_URI || '';
const FRONTEND_URL = process.env.FRONTEND_URL || '*';  // set in production!

/* ── CORS: allow frontend origin ─────────────────────── */
const corsOptions = {
  origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS']
};

const io = new Server(server, {
  cors: corsOptions
});

/* ── Connect to MongoDB ───────────────────────────────── */
async function connectDB() {
  if (!MONGODB_URI) {
    console.warn('[DB] ⚠️  MONGODB_URI not set. Running WITHOUT database (data will NOT persist).');
    return false;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    console.log('[DB] ✅  Connected to MongoDB Atlas');
    return true;
  } catch (err) {
    console.error('[DB] ❌  MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

/* ── Middleware ───────────────────────────────────────── */
app.use(cors(corsOptions));
app.use(express.json());
// Serve frontend static files (only in local/single-server mode)
if (!process.env.FRONTEND_URL || process.env.FRONTEND_URL === '*') {
  app.use(express.static(path.join(__dirname, '..')));
}

/* ── Health check ────────────────────────────────────── */
app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  rooms: Object.keys(rooms).length
}));

/* ── Authentication REST APIs ─────────────────────────── */

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'กรุณากรอกข้อมูลให้ครบ' });
  }
  const cleanUsername = String(username).trim();
  if (password.length < 8) {
    return res.status(400).json({ ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
  }

  try {
    const existing = await User.findOne({ username: cleanUsername.toLowerCase() });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Username นี้ถูกใช้แล้ว กรุณาเลือก Username ใหม่' });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const newUser = await User.create({
      username: cleanUsername.toLowerCase(),
      password: hashedPassword,
      displayName: displayName ? String(displayName).trim() : ''
    });

    console.log(`[Auth] Registered: ${cleanUsername}`);
    return res.json({
      ok: true,
      user: { id: newUser._id, username: newUser.username, displayName: newUser.displayName }
    });
  } catch (err) {
    console.error('[Auth.register] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'กรุณากรอก Username และ Password' });
  }

  try {
    const user = await User.findOne({ username: String(username).trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    const match = await bcrypt.compare(String(password), user.password);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    console.log(`[Auth] Logged in: ${user.username}`);
    return res.json({
      ok: true,
      user: { id: user._id, username: user.username, displayName: user.displayName }
    });
  } catch (err) {
    console.error('[Auth.login] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
  }
});

// POST /api/auth/update-profile
app.post('/api/auth/update-profile', async (req, res) => {
  const { id, displayName } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'User ID is required' });

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { displayName: displayName ? String(displayName).trim() : '' },
      { new: true }
    );
    if (!user) return res.status(404).json({ ok: false, error: 'ไม่พบผู้ใช้ในระบบ' });

    return res.json({
      ok: true,
      user: { id: user._id, username: user.username, displayName: user.displayName }
    });
  } catch (err) {
    console.error('[Auth.updateProfile] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
  }
});

/* ── History REST APIs ────────────────────────────────── */

// GET /api/history?userId=xxx
app.get('/api/history', async (req, res) => {
  const { userId } = req.query;
  try {
    const query = userId ? { userId } : {};
    const history = await History.find(query).sort({ savedAt: -1 }).limit(200);
    return res.json({ ok: true, history });
  } catch (err) {
    console.error('[History.get] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'โหลดประวัติไม่สำเร็จ' });
  }
});

// POST /api/history
app.post('/api/history', async (req, res) => {
  const session = req.body;
  if (!session) return res.status(400).json({ ok: false, error: 'No session data' });

  try {
    const entry = await History.create({
      ...session,
      id: session.id || ('hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
      savedAt: new Date()
    });
    console.log(`[History] Saved session: ${entry.subjectName || entry.roomCode}`);
    return res.json({ ok: true, entry });
  } catch (err) {
    // Handle duplicate id
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Session already saved' });
    }
    console.error('[History.save] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'บันทึกประวัติไม่สำเร็จ' });
  }
});

// DELETE /api/history/:id
app.delete('/api/history/:id', async (req, res) => {
  try {
    await History.deleteOne({ id: req.params.id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[History.delete] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'ลบประวัติไม่สำเร็จ' });
  }
});

// DELETE /api/history  (clear all for a user)
app.delete('/api/history', async (req, res) => {
  const { userId } = req.query;
  try {
    const query = userId ? { userId } : {};
    await History.deleteMany(query);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[History.clear] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'ลบประวัติไม่สำเร็จ' });
  }
});

/* ── Room verification endpoint ──────────────────────── */
app.get('/api/rooms/:code', (req, res) => {
  const room = rooms[req.params.code];
  if (!room) {
    return res.status(404).json({ ok: false, error: 'ไม่พบห้องเรียน หรือห้องเรียนถูกปิดแล้ว' });
  }
  return res.json({
    ok: true,
    room: {
      code: room.code,
      hostId: room.hostId,
      hostUsername: room.hostUsername,
      subjectCode: room.subjectCode,
      subjectName: room.subjectName,
      classroom: room.classroom,
      isCollecting: room.isCollecting,
      participantCount: Object.keys(room.participants).length
    }
  });
});

/* ── In-memory room store (live sessions only) ────────── */
const rooms = {};

function getRoom(code) { return rooms[code] ?? null; }

function getParticipantList(code) {
  const room = getRoom(code);
  if (!room) return [];
  return Object.values(room.participants).sort((a, b) => {
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

/* ── Socket.IO events ────────────────────────────────── */
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  /* HOST: Create room */
  socket.on('create_room', ({ roomCode, hostId, hostUsername, subjectCode, subjectName, classroom }, cb) => {
    rooms[roomCode] = {
      code: roomCode,
      hostSocketId: socket.id,
      hostId,
      hostUsername,
      subjectCode,
      subjectName,
      classroom,
      createdAt: new Date().toISOString(),
      isCollecting: false,
      roundCount: 0,
      participants: {},
      roundHistory: []
    };
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.isHost   = true;
    console.log(`[Room] Created: ${roomCode} by ${hostUsername}`);
    cb?.({ ok: true, room: rooms[roomCode] });
  });

  /* STUDENT: Join room */
  socket.on('join_room', ({ roomCode, username, displayName }, cb) => {
    const room = getRoom(roomCode);
    if (!room) {
      cb?.({ ok: false, error: 'ไม่พบห้องเรียน หรือห้องเรียนถูกปิดแล้ว' });
      return;
    }
    room.participants[socket.id] = {
      socketId: socket.id,
      username,
      displayName: displayName || username,
      emotion: null,
      isPaused: false,
      joinTime: new Date().toISOString()
    };
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.isHost   = false;

    io.to(roomCode).emit('participants_updated', {
      participants: getParticipantList(roomCode),
      joinedUser: { username, displayName: displayName || username }
    });

    cb?.({
      ok: true,
      room: {
        code: room.code,
        subjectCode: room.subjectCode,
        subjectName: room.subjectName,
        classroom: room.classroom,
        hostUsername: room.hostUsername
      },
      isCollecting: room.isCollecting
    });
    console.log(`[Room] ${displayName || username} joined ${roomCode}`);
  });

  /* HOST: Start collecting */
  socket.on('start_collecting', ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    room.isCollecting = true;
    room.collectionStartTime = new Date().toISOString();
    io.to(roomCode).emit('collecting_started');
    console.log(`[Room] Collecting started: ${roomCode}`);
  });

  /* HOST: Round snapshot */
  socket.on('round_snapshot', ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    room.roundCount++;
    const snapshot = {
      round: room.roundCount,
      time: new Date().toISOString(),
      data: Object.values(room.participants).map(p => ({
        username: p.username,
        displayName: p.displayName,
        emotion: p.emotion
      }))
    };
    room.roundHistory.push(snapshot);
    io.to(roomCode).emit('round_complete', { round: room.roundCount });
  });

  /* STUDENT: Submit emotion */
  socket.on('submit_emotion', ({ roomCode, emotion }) => {
    const room = getRoom(roomCode);
    if (!room || !room.participants[socket.id]) return;
    room.participants[socket.id].emotion = emotion;
    io.to(roomCode).emit('participants_updated', { participants: getParticipantList(roomCode) });
  });

  /* STUDENT: Pause/Resume */
  socket.on('toggle_pause', ({ roomCode, isPaused }) => {
    const room = getRoom(roomCode);
    if (!room || !room.participants[socket.id]) return;
    room.participants[socket.id].isPaused = isPaused;
  });

  /* HOST: End session — save history to MongoDB */
  socket.on('end_session', async ({ roomCode, sessionSummary }, cb) => {
    const room = getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;

    if (sessionSummary) {
      try {
        await History.create({
          ...sessionSummary,
          id: sessionSummary.id || ('hist_' + Date.now()),
          savedAt: new Date()
        });
        console.log(`[History] Saved via end_session: ${sessionSummary.subjectName || roomCode}`);
      } catch (err) {
        if (err.code !== 11000) console.error('[History] Save error:', err.message);
      }
    }

    io.to(roomCode).emit('session_ended', { roundHistory: room.roundHistory });
    io.in(roomCode).socketsLeave(roomCode);
    delete rooms[roomCode];
    console.log(`[Room] Session ended and closed: ${roomCode}`);
    cb?.({ ok: true });
  });

  /* HOST: Get room data (for export) */
  socket.on('get_room_data', ({ roomCode }, cb) => {
    cb?.(getRoom(roomCode) ?? null);
  });

  /* On disconnect */
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (code && rooms[code]) {
      const room = rooms[code];
      if (room.hostSocketId === socket.id) {
        io.to(code).emit('host_disconnected');
        delete rooms[code];
        console.log(`[Room] Host disconnected, closed room: ${code}`);
      } else if (room.participants[socket.id]) {
        delete room.participants[socket.id];
        io.to(code).emit('participants_updated', { participants: getParticipantList(code) });
      }
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

/* ── Helper: detect local IP ─────────────────────────── */
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

/* ── Boot ────────────────────────────────────────────── */
(async () => {
  await connectDB();

  server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log('\n==========================================================');
    console.log('  🚀 STU-Check server is running!');
    console.log(`  💻 Local:          http://localhost:${PORT}`);
    console.log(`  📱 Network:        http://${localIp}:${PORT}`);
    console.log(`  🌐 Frontend URL:   ${FRONTEND_URL}`);
    console.log('==========================================================\n');
  });
})();
