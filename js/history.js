/**
 * history.js — Session history CRUD + Excel export via SheetJS
 */

const HISTORY_KEY = 'stu_history';

const History = {
  getAll() {
    return Storage.get(HISTORY_KEY, []);
  },

  async fetchAll() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.ok && Array.isArray(data.history)) {
        Storage.set(HISTORY_KEY, data.history);
        return data.history;
      }
    } catch (err) {
      console.warn('[History.fetchAll] Offline fallback:', err);
    }
    return this.getAll();
  },

  async add(session) {
    const all = this.getAll();
    const entry = { ...session, id: session.id || generateId() };
    all.unshift(entry);
    Storage.set(HISTORY_KEY, all);

    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
    } catch (err) {
      console.warn('[History.add] Saved locally only:', err);
    }
    return entry;
  },

  async remove(id) {
    const filtered = this.getAll().filter(s => s.id !== id);
    Storage.set(HISTORY_KEY, filtered);

    try {
      await fetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('[History.remove] Local only delete:', err);
    }
  },

  async clear() {
    Storage.remove(HISTORY_KEY);

    try {
      await fetch('/api/history', { method: 'DELETE' });
    } catch (err) {
      console.warn('[History.clear] Local only clear:', err);
    }
  },

  /* Build detailed Excel workbook matching teacher live host view */
  exportAll() {
    const sessions = this.getAll();
    if (sessions.length === 0) { showToast('ไม่มีประวัติการเก็บข้อมูล', 'warning'); return; }
    if (typeof XLSX === 'undefined') { showToast('กำลังโหลด Excel library...', 'warning'); return; }

    const wb = XLSX.utils.book_new();

    /* Sheet 1: All Sessions Summary */
    const summaryRows = sessions.map((s, idx) => ({
      'ลำดับ': idx + 1,
      'รหัสวิชา': s.subjectCode,
      'ชื่อวิชา': s.subjectName,
      'ห้องเรียน': s.classroom,
      'รหัสห้อง': s.roomCode,
      'เวลาเริ่ม': formatDateTime(s.startTime),
      'เวลาสิ้นสุด': formatDateTime(s.endTime),
      'ระยะเวลารวม': formatDuration(new Date(s.endTime) - new Date(s.startTime)),
      'จำนวนผู้เข้าร่วม (คน)': s.participantCount,
      'จำนวนรอบที่เก็บ': s.rounds,
      'อารมณ์หลักของห้อง': emotionInfo(s.emotionSummary?.dominant ?? 1).label,
      'ยิ้ม/มีความสุข (%)': `${s.emotionSummary?.percentages?.[0] ?? 0}%`,
      'เฉยๆ/ปกติ (%)': `${s.emotionSummary?.percentages?.[1] ?? 0}%`,
      'เศร้า/เหนื่อย (%)': `${s.emotionSummary?.percentages?.[2] ?? 0}%`,
      'ไม่พบใบหน้า (%)': `${s.emotionSummary?.percentages?.[3] ?? 0}%`
    }));
    const wsSum = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSum, 'ภาพรวมทุกคาบ');

    /* Sheet 2: All Round Snapshots */
    const detailRows = [];
    sessions.forEach(s => {
      if (s.roundHistory?.length) {
        s.roundHistory.forEach(round => {
          round.data.forEach(p => {
            detailRows.push({
              'รหัสวิชา': s.subjectCode,
              'ห้องเรียน': s.classroom,
              'รหัสห้อง': s.roomCode,
              'รอบที่': round.round,
              'เวลาบันทึก': formatDateTime(round.time),
              'ชื่อนักเรียน': p.displayName || p.username,
              'Username': p.username,
              'ผลอารมณ์': emotionInfo(p.emotion ?? 1).label,
              'รหัสอารมณ์': p.emotion,
              'สถานะ': p.isPaused ? 'หยุดบันทึก (Pause)' : 'ปกติ'
            });
          });
        });
      }
    });
    if (detailRows.length > 0) {
      const wsDetail = XLSX.utils.json_to_sheet(detailRows);
      XLSX.utils.book_append_sheet(wb, wsDetail, 'ประวัติรายรอบทั้งหมด');
    }

    XLSX.writeFile(wb, `STU-Check_All_Sessions_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Export ประวัติทั้งหมดสำเร็จ!', 'success');
  },

  exportRoom(room) {
    if (typeof XLSX === 'undefined') { showToast('กำลังโหลด Excel library...', 'warning'); return; }
    const wb = XLSX.utils.book_new();

    const roomData = typeof room === 'string' ? this.getAll().find(x => x.id === room) : room;
    if (!roomData) { showToast('ไม่พบข้อมูลประวัติ', 'error'); return; }

    /* Sheet 1: Room Overview (ข้อมูลสรุปภาพรวมวิชา) */
    const infoRows = [
      { 'รายการสรุป': 'รหัสวิชา',               'รายละเอียด': roomData.subjectCode },
      { 'รายการสรุป': 'ชื่อวิชา',               'รายละเอียด': roomData.subjectName },
      { 'รายการสรุป': 'ห้องเรียน',              'รายละเอียด': roomData.classroom },
      { 'รายการสรุป': 'รหัสห้อง (Room Code)',   'รายละเอียด': roomData.roomCode || roomData.code },
      { 'รายการสรุป': 'เวลาเริ่มต้น',           'รายละเอียด': formatDateTime(roomData.startTime || roomData.createdAt) },
      { 'รายการสรุป': 'เวลาสิ้นสุด',            'รายละเอียด': roomData.endTime ? formatDateTime(roomData.endTime) : 'ยังไม่จบ' },
      { 'รายการสรุป': 'ระยะเวลารวม',           'รายละเอียด': roomData.endTime ? formatDuration(new Date(roomData.endTime) - new Date(roomData.startTime)) : '-' },
      { 'รายการสรุป': 'จำนวนรอบการเก็บข้อมูล',    'รายละเอียด': `${roomData.rounds || roomData.roundCount || 0} รอบ` },
      { 'รายการสรุป': 'จำนวนนักเรียนทั้งหมด',    'รายละเอียด': `${roomData.participantCount || 0} คน` },
      { 'รายการสรุป': 'อารมณ์เฉลี่ยหลักของห้อง', 'รายละเอียด': emotionInfo(roomData.emotionSummary?.dominant ?? 1).label },
      { 'รายการสรุป': 'สัดส่วน ยิ้ม/มีความสุข',   'รายละเอียด': `${roomData.emotionSummary?.percentages?.[0] ?? 0}% (${roomData.emotionSummary?.counts?.[0] ?? 0} ครั้ง)` },
      { 'รายการสรุป': 'สัดส่วน เฉยๆ/ปกติ',      'รายละเอียด': `${roomData.emotionSummary?.percentages?.[1] ?? 0}% (${roomData.emotionSummary?.counts?.[1] ?? 0} ครั้ง)` },
      { 'รายการสรุป': 'สัดส่วน เศร้า/เหนื่อย',   'รายละเอียด': `${roomData.emotionSummary?.percentages?.[2] ?? 0}% (${roomData.emotionSummary?.counts?.[2] ?? 0} ครั้ง)` },
      { 'รายการสรุป': 'สัดส่วน ไม่พบใบหน้า',      'รายละเอียด': `${roomData.emotionSummary?.percentages?.[3] ?? 0}% (${roomData.emotionSummary?.counts?.[3] ?? 0} ครั้ง)` },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoRows), 'สรุปวิชา');

    /* Sheet 2: Detailed Round Snapshots (ข้อมูลทุกรอบที่ครูกดบันทึก) */
    if (roomData.roundHistory?.length) {
      const rows = [];
      roomData.roundHistory.forEach(round => {
        round.data.forEach((p, idx) => {
          rows.push({
            'ลำดับ': idx + 1,
            'รอบที่': round.round,
            'เวลาบันทึก': formatDateTime(round.time),
            'ชื่อนักเรียน': p.displayName || p.username,
            'Username': p.username,
            'ผลสีหน้า/อารมณ์': emotionInfo(p.emotion ?? 1).label,
            'รหัสอารมณ์': p.emotion ?? 1,
            'สถานะการส่งข้อมูล': p.isPaused ? 'หยุดชั่วคราว (Pause)' : 'ปกติ'
          });
        });
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'รายละเอียดแต่ละรอบ');

      /* Sheet 3: Individual Student Summary (สรุปรายบุคคล) */
      const studentMap = {};
      roomData.roundHistory.forEach(round => {
        round.data.forEach(p => {
          const key = p.username;
          if (!studentMap[key]) {
            studentMap[key] = {
              displayName: p.displayName || p.username,
              username: p.username,
              roundsCount: 0,
              emotions: { 0: 0, 1: 0, 2: 0, 3: 0 }
            };
          }
          studentMap[key].roundsCount++;
          studentMap[key].emotions[p.emotion ?? 1] = (studentMap[key].emotions[p.emotion ?? 1] || 0) + 1;
        });
      });

      const studentRows = Object.values(studentMap).map((st, i) => {
        let maxEmo = 1;
        let maxCnt = -1;
        Object.entries(st.emotions).forEach(([emo, cnt]) => {
          if (cnt > maxCnt) { maxCnt = cnt; maxEmo = Number(emo); }
        });
        return {
          'ลำดับ': i + 1,
          'ชื่อนักเรียน': st.displayName,
          'Username': st.username,
          'จำนวนรอบที่เข้าร่วม': st.roundsCount,
          'อารมณ์ส่วนใหญ่': emotionInfo(maxEmo).label,
          'มีความสุข (ครั้ง)': st.emotions[0] || 0,
          'เฉยๆ (ครั้ง)': st.emotions[1] || 0,
          'เศร้า/เหนื่อย (ครั้ง)': st.emotions[2] || 0,
          'ไม่พบใบหน้า (ครั้ง)': st.emotions[3] || 0
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentRows), 'สรุปผลรายบุคคล');
    }

    const filename = `STU-Check_${roomData.subjectCode}_${roomData.classroom}_${roomData.roomCode || roomData.code || 'export'}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast('Export ข้อมูลละเอียดสำเร็จ!', 'success');
  }
};

/* ── Delete Helpers ───────────────────────────────────── */
async function deleteHistoryRecord(id) {
  if (confirm('คุณต้องการลบประวัติการเก็บข้อมูลนี้ใช่หรือไม่?')) {
    await History.remove(id);
    showToast('ลบประวัติเรียบร้อยแล้ว', 'success');
    renderHistoryTable();
  }
}

async function clearAllHistory() {
  if (confirm('คุณต้องการลบประวัติการเก็บข้อมูลทั้งหมดใช่หรือไม่? (ไม่สามารถกู้คืนได้)')) {
    await History.clear();
    showToast('ลบประวัติทั้งหมดเรียบร้อยแล้ว', 'success');
    renderHistoryTable();
  }
}

/* ── Render History Table ────────────────────────────── */
function renderHistoryTable(containerId = 'history-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  function doRender(sessions) {
    if (!sessions || sessions.length === 0) {
      container.innerHTML = `
        <div class="history-empty">
          <div class="history-empty-icon"><i class="bi bi-clipboard2-data" style="font-size:2.5rem;color:var(--slate-300)"></i></div>
          <p>ยังไม่มีประวัติการเก็บข้อมูล<br>กด "สร้างห้อง" เพื่อเริ่มเก็บข้อมูลครั้งแรก</p>
        </div>`;
      return;
    }

    const rows = sessions.map(s => {
      const domEmo = emotionInfo(s.emotionSummary?.dominant ?? 1);
      return `
      <tr>
        <td>${formatDateTime(s.startTime)}</td>
        <td><span class="badge badge-indigo">${s.subjectCode}</span></td>
        <td>${s.subjectName}</td>
        <td>${s.classroom}</td>
        <td>${formatDuration(new Date(s.endTime) - new Date(s.startTime))}</td>
        <td>${s.rounds} รอบ</td>
        <td>${s.participantCount} คน</td>
        <td><span class="badge badge-slate">${domEmo.emoji} ${domEmo.label}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm btn-secondary" title="Export Excel" onclick="History.exportRoom('${s.id}')">
              <i class="bi bi-file-earmark-spreadsheet-fill"></i> Excel
            </button>
            <button class="btn btn-sm btn-danger" title="ลบประวัติ" onclick="deleteHistoryRecord('${s.id}')">
              <i class="bi bi-trash-fill"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>วันที่/เวลา</th>
              <th>รหัสวิชา</th>
              <th>ชื่อวิชา</th>
              <th>ห้องเรียน</th>
              <th>ระยะเวลา</th>
              <th>รอบ</th>
              <th>ผู้เข้าร่วม</th>
              <th>ผลสรุปหลัก</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // 1. Initial render from local cache
  doRender(History.getAll());

  // 2. Fetch fresh data from server and re-render
  History.fetchAll().then(serverSessions => {
    doRender(serverSessions);
  });
}

