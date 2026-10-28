/* ================= Медиаярмарка — Волонтёр ================= */

(function(){
  if (!window.__MF.requireRole(['volunteer'])) return;

  const $ = (id) => document.getElementById(id);
  const user = window.__MF.getCurrentUser();
  if (!user) return;
  $('headerUser').textContent = user.username + ' · ' + (user.team || '');
  $('headerRole').className = 'badge volunteer';
  $('headerRole').textContent = 'Волонтёр';

  let scannedParticipant = null;

  function renderTasksSelect(){
    const tasks = window.__MF.getTasks();
    const sel = $('awardTask');
    sel.innerHTML = tasks.map(t => `<option value="${t.id}">${window.__MF.escapeHtml(t.title)} (${window.__MF.fmtPoints(t.points||0)} оч.)</option>`).join('');
  }
  renderTasksSelect();

  function findByQr(qr){
    if (!qr) return null;
    const users = window.__MF.getUsersRaw();
    return users.find(u => u.qr === qr.trim());
  }

  function showParticipant(u){
    if (!u) { $('participantCard').style.display = 'none'; $('participantEmpty').style.display = 'block'; scannedParticipant = null; return; }
    scannedParticipant = u;
    $('participantCard').style.display = 'block';
    $('participantEmpty').style.display = 'none';
    const letter = (u.username || 'U').charAt(0).toUpperCase();
    $('avatarLetter').textContent = letter;
    $('pName').textContent = window.__MF.escapeHtml(u.username);
    $('pTeam').textContent = window.__MF.escapeHtml(u.team || 'Без команды');
    $('pQr').textContent = u.qr || '—';
    const total = window.__MF.getUserTotalPoints(u.id);
    $('pCurrentPoints').textContent = window.__MF.fmtPoints(total) + ' очков';
    $('awardAlert').style.display = 'none';
  }

  $('btnLookupManual').addEventListener('click', () => {
    const u = findByQr($('manualQr').value);
    if (!u) { $('scanAlert').textContent = 'Участник с таким QR-кодом не найден.'; $('scanAlert').style.display = 'block'; return; }
    showParticipant(u);
    $('scanAlert').textContent = 'Участник найден: ' + u.username;
    $('scanAlert').className = 'alert ok';
    $('scanAlert').style.display = 'block';
    setTimeout(() => { $('scanAlert').style.display = 'none'; }, 3000);
  });
  $('manualQr').addEventListener('keypress', e => { if (e.key === 'Enter') $('btnLookupManual').click(); });

  $('awardForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!scannedParticipant) { $('awardAlert').textContent = 'Сначала найдите участника.'; $('awardAlert').style.display = 'block'; return; }
    const taskId = $('awardTask').value;
    const points = Number($('awardPoints').value) || 0;
    const note = $('awardNote').value.trim();
    const tasks = window.__MF.getTasks();
    const task = tasks.find(t => t.id === taskId);

    window.__MF.addPoints({
      userId: scannedParticipant.id,
      taskId: taskId,
      points,
      awardedBy: user.id,
      note: note || (task ? task.title : 'Начисление'),
    });
    $('awardAlert').textContent = 'Начислено +' + window.__MF.fmtPoints(points) + ' участнику ' + scannedParticipant.username;
    $('awardAlert').className = 'alert ok';
    $('awardAlert').style.display = 'block';
    showParticipant(scannedParticipant);
    renderRecent();
    $('awardForm').reset();
    $('awardPoints').value = '50';
  });

  function renderRecent(){
    const points = window.__MF.getPoints().slice().sort((a,b)=>b.awardedAt-a.awardedAt).slice(0, 12);
    const users = window.__MF.getUsersRaw();
    const tasks = window.__MF.getTasks();
    const tbody = $('recentAwards');
    tbody.innerHTML = '';
    if (points.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty" style="padding:10px;">Пока нет начислений</td></tr>';
      return;
    }
    points.forEach(p => {
      const u = users.find(x => x.id === p.userId);
      const t = tasks.find(x => x.id === p.taskId);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${window.__MF.escapeHtml(u ? u.username : '—')}</td><td class="small">${window.__MF.escapeHtml(u ? (u.team||'—') : '—')}</td><td style="color:var(--dashboard);font-weight:700">+${window.__MF.fmtPoints(p.points)}</td><td class="small">${window.__MF.escapeHtml(t ? t.title : (p.note||'—'))}</td><td class="small">${window.__MF.fmtDate(p.awardedAt)}</td>`;
      tbody.appendChild(tr);
    });
  }

  /* ---------- сканер камеры (html5-qrcode) ---------- */
  function tryCameraScanner(){
    const Html5Qrcode = window.Html5Qrcode;
    if (window.__MF.__qrScannerUnavailable || !Html5Qrcode) return false;
    const reader = $('reader');
    reader.innerHTML = '';
    const videoContainer = document.createElement('div');
    videoContainer.id = 'qr-video-container';
    reader.appendChild(videoContainer);

    const html5Qrcode = new Html5Qrcode('qr-video-container', { verbose: false });
    html5Qrcode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        html5Qrcode.stop().then(() => {}).catch(() => {});
        const u = findByQr(decodedText);
        if (u) {
          showParticipant(u);
          $('scanAlert').textContent = 'Отсканировано: ' + u.username;
          $('scanAlert').className = 'alert ok';
          $('scanAlert').style.display = 'block';
          setTimeout(() => { $('scanAlert').style.display = 'none'; }, 3000);
        } else {
          $('scanAlert').textContent = 'QR-код не распознан как участник.';
          $('scanAlert').style.display = 'block';
        }
      },
      (errorMessage) => {}
    ).catch(err => {
      reader.innerHTML = '<div style="color:var(--text-muted);">Камера недоступна. Используйте ручной ввод.</div>';
      console.warn('QR scanner start failed', err);
      return false;
    });
    return true;
  }

  tryCameraScanner();

  window.addEventListener('storage', () => {
    if (scannedParticipant) showParticipant(scannedParticipant);
    renderRecent();
  });

  $('btnLogout').addEventListener('click', () => window.__MF.logout());
  renderRecent();
})();
