# STU-Check — Deployment Guide

## Architecture

```
GitHub Pages (Frontend)  ←→  Render.com (Backend)  ←→  MongoDB Atlas (Database)
HTML / CSS / JS               Node.js + Socket.IO        Users + History
```

---

## Step 1 — MongoDB Atlas (Database)

1. ไปที่ https://cloud.mongodb.com → สมัครฟรี
2. สร้าง Cluster ใหม่ เลือก **M0 Free**
3. ไปที่ **Database Access** → Add User → กำหนด username/password
4. ไปที่ **Network Access** → Add IP → กรอก `0.0.0.0/0` (allow all)
5. ไปที่ Cluster → **Connect** → **Drivers** → คัดลอก Connection String:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/stucheck
   ```

---

## Step 2 — Push โค้ดขึ้น GitHub

```bash
# ใน PowerShell/Terminal ที่ folder Stucheck
git init
git add .
git commit -m "feat: add MongoDB + deploy config"
```

สร้าง repo ใหม่ที่ https://github.com/new ชื่อ `stucheck`

```bash
git remote add origin https://github.com/YOUR_USERNAME/stucheck.git
git branch -M main
git push -u origin main
```

---

## Step 3 — Deploy Backend บน Render.com

1. ไปที่ https://render.com → สมัครฟรี (ใช้ GitHub login ได้)
2. **New → Web Service** → Connect GitHub repo `stucheck`
3. ตั้งค่า:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. เพิ่ม **Environment Variables:**
   | Key | Value |
   |-----|-------|
   | `MONGODB_URI` | connection string จาก MongoDB Atlas |
   | `FRONTEND_URL` | `https://YOUR_USERNAME.github.io/stucheck` |
   | `NODE_ENV` | `production` |
5. กด **Create Web Service** → รอ ~2-3 นาที
6. บันทึก URL เช่น `https://stucheck-xxxx.onrender.com`

---

## Step 4 — แก้ Frontend Config

เปิดไฟล์ [`js/config.js`](js/config.js) แก้บรรทัดนี้:

```js
// เปลี่ยนจาก:
const BACKEND_URL = '';

// เป็น:
const BACKEND_URL = 'https://stucheck-xxxx.onrender.com';  // ← Render URL ของคุณ
```

จากนั้น commit และ push ใหม่:

```bash
git add js/config.js
git commit -m "config: set production backend URL"
git push
```

---

## Step 5 — Enable GitHub Pages (Frontend)

1. ไปที่ GitHub repo → **Settings → Pages**
2. **Source:** Deploy from branch → `main` → root `/`
3. กด Save → รอ ~1-2 นาที
4. Frontend จะพร้อมใช้ที่ `https://YOUR_USERNAME.github.io/stucheck`

---

## ✅ ทดสอบหลัง Deploy

| ทดสอบ | URL |
|--------|-----|
| Health check | `https://stucheck-xxxx.onrender.com/api/health` |
| Frontend | `https://YOUR_USERNAME.github.io/stucheck` |

---

## ⚠️ หมายเหตุสำคัญ

- **Render Free Tier:** server จะ sleep หลังไม่มี traffic 15 นาที → ครั้งแรกจะช้า ~30 วินาที
- **ห้าม commit `.env`** ไปใน GitHub เด็ดขาด (`.gitignore` ป้องกันไว้แล้ว)
- รหัสผ่านถูก hash ด้วย bcrypt แล้ว — ไม่มีใครเห็น plain text ได้

---

## Local Development

```bash
# 1. คัดลอก env template
copy server\.env.example server\.env
# 2. แก้ไข server\.env ใส่ MONGODB_URI จริง
# 3. รัน server
cd server
npm start
# เปิด http://localhost:3000
```
