# STU-Check — README

> **Privacy-First Classroom Emotion Monitoring System**
> วิเคราะห์สีหน้านักเรียนในห้องเรียนแบบเรียลไทม์ โดยประมวลผลภาพบนเครื่องของผู้เรียนเท่านั้น

---

## สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [โครงสร้างไฟล์](#2-โครงสร้างไฟล์)
3. [วิธีติดตั้งและรันระบบ](#3-วิธีติดตั้งและรันระบบ)
4. [สถาปัตยกรรมและการทำงาน](#4-สถาปัตยกรรมและการทำงาน)
5. [หน้าจอทั้งหมด (8 หน้า)](#5-หน้าจอทั้งหมด-8-หน้า)
6. [ระบบตรวจจับอารมณ์ (MediaPipe)](#6-ระบบตรวจจับอารมณ์-mediapipe)
7. [การซิงค์ข้อมูลแบบเรียลไทม์ (BroadcastChannel)](#7-การซิงค์ข้อมูลแบบเรียลไทม์-broadcastchannel)
8. [โทนสีและ Design System](#8-โทนสีและ-design-system)
9. [localStorage Data Schema](#9-localstorage-data-schema)
10. [Socket.IO Server Events](#10-socketio-server-events)
11. [วิธี Debug ปัญหาที่พบบ่อย](#11-วิธี-debug-ปัญหาที่พบบ่อย)
12. [Checklist สำหรับ AI ที่มาแก้ต่อ](#12-checklist-สำหรับ-ai-ที่มาแก้ต่อ)

---

## 1. ภาพรวมระบบ

| หัวข้อ | รายละเอียด |
|---|---|
| **ประเภท** | Web App (Vanilla HTML + CSS + JS) |
| **Backend** | Node.js + Express + Socket.IO (optional — ดู §7) |
| **การตรวจจับอารมณ์** | MediaPipe FaceMesh (client-side, ไม่ส่งภาพออก) |
| **การจัดเก็บข้อมูล** | localStorage (ไม่มี database) |
| **Export** | SheetJS — ไฟล์ .xlsx |
| **Font** | Outfit (Google Fonts) |
| **เบราว์เซอร์รองรับ** | Chrome 90+, Edge 90+, Firefox 88+, Safari 15+ |

### ขั้นตอนการใช้งาน (Flow)

```
ครู: สมัคร → Login → Dashboard → สร้างห้อง → กรอกข้อมูลวิชา → Host Dashboard
นักเรียน: สมัคร → Login → Dashboard → เข้าร่วม → กรอกรหัส → Privacy Modal → Student Room
```

---

## 2. โครงสร้างไฟล์

```
Stucheck/
├── index.html           ← หน้าแรก (Landing)
├── register.html        ← สมัครสมาชิก
├── login.html           ← เข้าสู่ระบบ
├── dashboard.html       ← แดชบอร์ดหลัก (เลือกบทบาท + ประวัติ)
├── create-room.html     ← กรอกข้อมูลวิชาก่อนเปิดห้อง
├── host-room.html       ← Live Dashboard สำหรับครู
├── join-room.html       ← กรอกรหัสห้อง + Privacy Modal
├── student-room.html    ← ห้องเรียนนักเรียน + MediaPipe
│
├── css/
│   └── style.css        ← Design system ทั้งหมด (CSS variables + components)
│
├── js/
│   ├── utils.js         ← Shared helpers: Toast, Storage, Session, formatters
│   ├── auth.js          ← Register/Login/Logout logic
│   ├── room.js          ← Room CRUD, BroadcastChannel Bus, Join/Create pages
│   ├── host.js          ← Host dashboard: timer, participant list, emotion aggregate
│   ├── student.js       ← Student room: camera, MediaPipe, emotion send
│   └── history.js       ← History CRUD, Excel export (SheetJS)
│
└── server/
    ├── package.json     ← Dependencies: express, socket.io, cors
    └── server.js        ← Node.js server (optional enhancement)
```

### ลำดับการโหลด JS ในแต่ละหน้า

```
utils.js → auth.js → room.js → history.js → host.js / student.js
```

> **สำคัญ:** ทุกหน้าต้องโหลด `utils.js` ก่อนเสมอ เพราะ `Storage`, `Session`, `showToast` ฯลฯ อยู่ใน utils

---

## 3. วิธีติดตั้งและรันระบบ

### ขั้นตอนที่ 1 — ติดตั้ง dependencies ของ server
```bash
cd server
npm install
```

### ขั้นตอนที่ 2 — รัน server
```bash
node server.js
# หรือ
npm start
```

Server จะรันที่ `http://localhost:3000`

### ขั้นตอนที่ 3 — เปิดเว็บ
เปิดเบราว์เซอร์ไปที่ `http://localhost:3000`

> **หมายเหตุ:** MediaPipe ต้องการ HTTPS หรือ localhost เท่านั้น — ห้ามเปิดไฟล์ผ่าน `file://`

---

## 4. สถาปัตยกรรมและการทำงาน

### Mode การทำงาน

ระบบทำงานผ่าน **BroadcastChannel API** (สื่อสารระหว่าง browser tabs บนเครื่องเดียวกัน):

```
Host Tab  ←──── BroadcastChannel('stu-check-bus') ────→  Student Tab(s)
```

ข้อมูลที่ส่งผ่าน Bus:
| Event | ทิศทาง | Payload |
|---|---|---|
| `student_joined` | Student → Host | `{ roomCode, username, displayName, socketId }` |
| `student_left` | Student → Host | `{ roomCode, socketId }` |
| `host_start` | Host → Students | `{ roomCode }` |
| `session_ended` | Host → Students | `{ roomCode }` |
| `round_complete` | Host → Students | `{ roomCode, round }` |
| `emotion_update` | Student → Host | `{ roomCode, socketId, emotion }` |

### Server (socket.io) — ตัวเลือกเสริม
Server ใน `server/server.js` รองรับ events เดียวกัน ผ่าน Socket.IO สำหรับการใช้งานบนเครือข่ายจริง (ครู-นักเรียนคนละเครื่อง) — ยังไม่ integrate ใน frontend (พร้อมสำหรับ Phase 2)

---

## 5. หน้าจอทั้งหมด (8 หน้า)

### 1. `index.html` — Landing Page
- Redirect ไป `/dashboard.html` ถ้า login อยู่แล้ว
- มีปุ่ม Login / Register
- Features section 3 cards

### 2. `register.html` — สมัครสมาชิก
- ฟังก์ชันหลัก: `initRegisterPage()` ใน `auth.js`
- Validation: username ห้ามซ้ำ, password ≥ 8 ตัวอักษร, confirm password ต้องตรง
- เก็บข้อมูลใน localStorage key: `stu_users` (array of user objects)

### 3. `login.html` — เข้าสู่ระบบ
- ฟังก์ชันหลัก: `initLoginPage()` ใน `auth.js`
- เก็บ session ใน localStorage key: `stu_session`

### 4. `dashboard.html` — Main Dashboard
- ตรวจสอบ session ด้วย `Session.require()`
- แสดง 2 role cards: สร้างห้อง / เข้าร่วม
- History table: `renderHistoryTable('history-container')` จาก `history.js`
- Export ทั้งหมด: `History.exportAll()`

### 5. `create-room.html` — สร้างห้องเรียน
- ฟังก์ชันหลัก: `initCreateRoomPage()` ใน `room.js`
- สร้าง room ด้วย `Rooms.create(...)` → บันทึก localStorage key: `stu_rooms`
- Redirect ไป `host-room.html?code=XXXXXX`

### 6. `host-room.html` — Host Dashboard
- ฟังก์ชันหลัก: `initHostPage()` ใน `host.js`
- ดึง `?code=` จาก URL
- ตรวจสอบว่า `room.hostId === user.id`
- Timer: `startElapsedTimer()` (นับเวลา), countdown 60 วิ
- ปุ่มเริ่ม: `startCollecting()` → emit `host_start`
- ปุ่มจบ: `endSession()` → บันทึก History, ลบ Room, redirect

### 7. `join-room.html` — เข้าร่วมห้อง
- ฟังก์ชันหลัก: `initJoinRoomPage()` ใน `room.js`
- ตรวจสอบ room code 6 หลักตัวเลข
- เปิด Privacy Modal → ยืนยัน → redirect ไป `student-room.html?code=XXXXXX`

### 8. `student-room.html` — ห้องเรียนนักเรียน
- ฟังก์ชันหลัก: `initStudentPage()` ใน `student.js`
- เปิดกล้องด้วย `initCamera()`
- MediaPipe FaceMesh: `initMediaPipe()` → `classifyEmotion()` → `setEmotionDisplay()`
- Pause: `togglePause()` — หยุดส่งอารมณ์ชั่วคราว
- Leave: `leaveRoom()` — emit `student_left`, redirect

---

## 6. ระบบตรวจจับอารมณ์ (MediaPipe)

### Landmark Indices ที่ใช้
| จุด | Index |
|---|---|
| ตาขวา (outer, inner, top, bottom) | 33, 133, 159, 145 |
| ตาซ้าย (outer, inner, top, bottom) | 263, 362, 386, 374 |
| มุมปากซ้าย | 61 |
| มุมปากขวา | 291 |
| ริมฝีปากบน | 13 |
| ริมฝีปากล่าง | 14 |
| ปลายจมูก | 4 |

### สูตรการจำแนกอารมณ์

```js
// Eye Aspect Ratio (EAR) = vertical / horizontal
EAR = |top.y - bottom.y| / |outer.x - inner.x|

// เฉลี่ย EAR ทั้งสองตา
avgEAR = (rEAR + lEAR) / 2

// Smile: มุมปากอยู่สูงกว่า (y น้อยกว่า) ริมฝีปากบน
smileRatio = topLip.y - cornerAvgY  // negative = ยิ้ม

// Classification
if avgEAR < 0.20       → 2 (Sad/Tired — ตาหรี่)
if smileRatio < -0.005 → 0 (Happy — ยิ้ม)
else                   → 1 (Neutral)
```

### รหัสอารมณ์
| รหัส | ความหมาย | Emoji |
|---|---|---|
| `0` | Happy | 😊 |
| `1` | Neutral | 😐 |
| `2` | Sad/Tired | 😔 |
| `3` | No face detected | 🚫 |

---

## 7. การซิงค์ข้อมูลแบบเรียลไทม์ (BroadcastChannel)

ระบบใช้ `BroadcastChannel('stu-check-bus')` สื่อสารระหว่าง tabs ในเบราว์เซอร์เดียวกัน

```js
// ส่ง event
Bus.emit('host_start', { roomCode: '123456' });

// รับ event
Bus.on('host_start', ({ roomCode }) => {
  // handle...
});
```

**ข้อจำกัด:** BroadcastChannel ทำงานได้เฉพาะใน browser tabs บน **domain/origin เดียวกัน** — ใช้สำหรับ demo บนเครื่องเดียว

**สำหรับ Production (เครือข่ายจริง):** ให้ integrate `socket.io-client` ใน frontend และเชื่อมต่อกับ `server/server.js`

---

## 8. โทนสีและ Design System

CSS Variables ทั้งหมดอยู่ใน `css/style.css` section `:root`

| Variable | Value | ใช้งาน |
|---|---|---|
| `--primary` | `#4F46E5` | ปุ่มหลัก, link, highlight |
| `--primary-light` | `#EEF2FF` | background badge indigo |
| `--emerald` | `#10B981` | privacy, success, join |
| `--purple` | `#9333EA` | accent, logo gradient |
| `--bg` | `#F8FAFC` | background หน้าเว็บ |
| `--text-1` | `#0F172A` | ข้อความหลัก |
| `--text-2` | `#64748B` | ข้อความรอง |
| `--border` | `#E2E8F0` | เส้นขอบ card |
| `--sky-400` | `#38BDF8` | ขอบกล้องนักเรียนขณะเก็บข้อมูล |
| `--amber-500` | `#F59E0B` | ปุ่ม Pause |
| `--rose-600` | `#E11D48` | ปุ่ม Leave/Danger |

### Component Classes หลัก

```css
/* Buttons */
.btn .btn-primary .btn-secondary .btn-emerald .btn-amber .btn-danger .btn-ghost
.btn-lg .btn-sm .btn-full

/* Cards */
.card .card-lg .card-sm

/* Badges */
.badge .badge-indigo .badge-emerald .badge-amber .badge-rose .badge-slate

/* Forms */
.form-group .form-label .form-input .form-error .form-hint .form-stack

/* Layout */
.container .container-sm .container-md
.auth-page .auth-left .auth-right
.role-cards .role-card .host-body .student-body .stats-grid
```

---

## 9. localStorage Data Schema

### `stu_users` — Array ผู้ใช้ทั้งหมด
```json
[
  {
    "id": "uuid-string",
    "username": "teacher01",
    "password": "password123",
    "displayName": "อาจารย์มนัส",
    "createdAt": "2026-09-08T15:00:00.000Z"
  }
]
```

### `stu_session` — User session ปัจจุบัน
```json
{
  "id": "uuid-string",
  "username": "teacher01",
  "displayName": "อาจารย์มนัส"
}
```

### `stu_rooms` — ห้องที่กำลังเปิดอยู่
```json
{
  "123456": {
    "code": "123456",
    "hostId": "uuid",
    "hostUsername": "teacher01",
    "subjectCode": "CS101",
    "subjectName": "คอมพิวเตอร์เบื้องต้น",
    "classroom": "ม.4/1",
    "createdAt": "ISO-string",
    "isCollecting": false,
    "roundCount": 3,
    "participants": {
      "stu_sid_abc123": {
        "username": "student01",
        "displayName": "นักเรียน A",
        "emotion": 0,
        "isPaused": false,
        "joinTime": "ISO-string"
      }
    },
    "roundHistory": [
      {
        "round": 1,
        "time": "ISO-string",
        "data": [{ "username": "student01", "displayName": "นักเรียน A", "emotion": 0 }]
      }
    ]
  }
}
```

### `stu_history` — ประวัติการเก็บข้อมูล (array)
```json
[
  {
    "id": "uuid",
    "subjectCode": "CS101",
    "subjectName": "คอมพิวเตอร์เบื้องต้น",
    "classroom": "ม.4/1",
    "roomCode": "123456",
    "startTime": "ISO-string",
    "endTime": "ISO-string",
    "rounds": 3,
    "participantCount": 25,
    "emotionSummary": {
      "dominant": 0,
      "counts": { "0": 15, "1": 8, "2": 2, "3": 0 },
      "total": 25,
      "percentages": { "0": 60, "1": 32, "2": 8, "3": 0 }
    },
    "roundHistory": [...]
  }
]
```

---

## 10. Socket.IO Server Events

สำหรับ Phase 2 เมื่อต้องการใช้งานบนเครือข่ายจริง:

| Event | จาก | ไปยัง | Payload |
|---|---|---|---|
| `create_room` | Host | Server | `{ roomCode, hostUsername, subjectCode, subjectName, classroom }` |
| `join_room` | Student | Server | `{ roomCode, username, displayName }` |
| `start_collecting` | Host | Server | `{ roomCode }` |
| `round_snapshot` | Host | Server | `{ roomCode }` |
| `submit_emotion` | Student | Server | `{ roomCode, emotion }` |
| `toggle_pause` | Student | Server | `{ roomCode, isPaused }` |
| `end_session` | Host | Server | `{ roomCode }` |
| `get_room_data` | Host | Server | `{ roomCode }` |
| `participants_updated` | Server | Room | `{ participants }` |
| `collecting_started` | Server | Room | — |
| `round_complete` | Server | Room | `{ round }` |
| `session_ended` | Server | Room | `{ roundHistory }` |
| `host_disconnected` | Server | Students | — |

---

## 11. วิธี Debug ปัญหาที่พบบ่อย

### กล้องไม่เปิด
- ตรวจสอบว่าเปิดเว็บผ่าน `http://localhost` ไม่ใช่ `file://`
- ตรวจสอบสิทธิ์กล้องในเบราว์เซอร์: `Settings > Privacy > Camera`

### MediaPipe ไม่โหลด
- ตรวจสอบ Console — หาก `FaceMesh is not defined` แปลว่า CDN ไม่โหลด
- ลอง hard refresh (`Ctrl+Shift+R`)
- ตรวจสอบ network CDN: `https://cdn.jsdelivr.net/npm/@mediapipe/`

### นักเรียนไม่ปรากฏในรายชื่อของครู
- ต้องเปิด host tab และ student tab **ใน browser เดียวกัน** บนเครื่องเดียวกัน (BroadcastChannel)
- ตรวจ Console ว่า Bus emit/on ทำงานถูกต้อง

### รหัสห้องหาไม่พบ
- ตรวจ localStorage: `stu_rooms` key ว่ามีห้องนั้นอยู่
- ห้องถูกลบเมื่อ: ครูกด "จบการเก็บข้อมูล" หรือ server restart

### ประวัติไม่บันทึก
- ประวัติบันทึกเฉพาะเมื่อ **ครูกดปุ่ม "จบการเก็บข้อมูล"** เท่านั้น
- หากนักเรียนกดออกเอง (`leaveRoom()`) จะไม่มีการบันทึก

### Excel Export ไม่ทำงาน
- ตรวจว่า SheetJS โหลดแล้ว: `typeof XLSX !== 'undefined'`
- CDN: `https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js`

---

## 12. Checklist สำหรับ AI ที่มาแก้ต่อ

> อ่านส่วนนี้ก่อนแก้ไขโค้ดทุกครั้ง

### เมื่อแก้ UI / Styling
- [ ] CSS Variables อยู่ใน `css/style.css` section `:root`
- [ ] ห้ามใช้ TailwindCSS — ใช้ CSS classes จาก `style.css` เท่านั้น
- [ ] ทดสอบ responsive ที่ 900px (breakpoint หลัก) และ 560px

### เมื่อเพิ่มหน้าใหม่
- [ ] โหลด `utils.js` เป็นสคริปต์แรกเสมอ
- [ ] เรียก `Session.require()` ถ้าหน้านั้น require login
- [ ] เพิ่มหน้าในตาราง §5 ของ README นี้

### เมื่อแก้ Logic การเก็บข้อมูล
- [ ] อย่าส่งภาพออกจากเครื่องผู้เรียน — ส่งได้แค่รหัสอารมณ์ (0, 1, 2, 3)
- [ ] `calcAverageEmotion()` อยู่ใน `utils.js`
- [ ] `sortParticipants()` ใช้ลำดับ: ตัวเลขก่อน → ก-ฮ → A-Z

### เมื่อแก้ MediaPipe
- [ ] Landmark indices อยู่ใน `js/student.js` ฟังก์ชัน `classifyEmotion()`
- [ ] ดูตาราง landmark ใน §6 ของ README
- [ ] ทดสอบที่ `http://localhost` (กล้องไม่ทำงานบน `file://`)

### เมื่อแก้ BroadcastChannel events
- [ ] Events ทั้งหมดอยู่ใน `js/room.js` (Bus object) และ `js/host.js`, `js/student.js`
- [ ] ดูตาราง events ใน §7 ของ README
- [ ] ทดสอบด้วยการเปิด 2 tabs ใน browser เดียวกัน

### เมื่อแก้ localStorage schema
- [ ] Keys: `stu_users`, `stu_session`, `stu_rooms`, `stu_history`
- [ ] ดู schema ใน §9 ของ README
- [ ] `Storage` helper อยู่ใน `utils.js`

---

## License

MIT — ใช้งานได้อย่างอิสระ สำหรับการศึกษาและการวิจัย
