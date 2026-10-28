/* ================= Медиаярмарка — Волонтёр ================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;

  let tasks = [];
  let scannedParticipant = null;
  let selectedTask = null;
  let scanner = null;

  /* ---------- задания ---------- */
  function renderTasksSelect() {
    const select = $('awardTask');

    if (tasks.length === 0) {
      select.innerHTML = '<option value="">Заданий пока нет</option>';
      select.disabled = true;
      return;
    }

    select.disabled = false;
    select.innerHTML = tasks
      .map((t) => {
        const suffix = t.type === 'station' ? '' : '';
        return '<option value="' + MF.escapeHtml(t.id) + '">' +
          MF.escapeHtml(t.title) + ' (' + MF.fmtPoints(t.points) + ' оч.' + suffix + ')</option>';
      })
      .join('');

    syncTaskFields();
  }

  function syncTaskFields() {
    const id = $('awardTask').value;
    selectedTask = tasks.find((t) => t.id === id) || null;
    const isStation = !!selectedTask && selectedTask.type === 'station';

    $('awardPoints').disabled = isStation;
    $('awardPointsHint').style.display = isStation ? 'block' : 'none';
    if (selectedTask) $('awardPoints').value = String(selectedTask.points);
  }

  /* ---------- поиск участника ---------- */
  function showParticipant(participant) {
    if (!participant) {
      scannedParticipant = null;
      $('participantCard').style.display = 'none';
      $('participantEmpty').style.display = 'block';
      return;
    }

    scannedParticipant = participant;
    $('participantCard').style.display = 'block';
    $('participantEmpty').style.display = 'none';
    $('avatarLetter').textContent = (participant.username || 'U').charAt(0).toUpperCase();
    $('pName').textContent = participant.username;
    $('pTeam').textContent = participant.team || 'Без команды';
    $('pQr').textContent = participant.qr || '—';
    $('pCurrentPoints').textContent = MF.fmtPoints(participant.totalPoints) + ' очков';
    MF.hideAlert('awardAlert');
  }

  function scanMessage(message, type) {
    MF.showAlert('scanAlert', message, type);
    if (type === 'ok') setTimeout(() => MF.hideAlert('scanAlert'), 4000);
  }

  async function lookup(qr) {
    const code = (qr || '').trim();
    if (!code) {
      scanMessage('Введите QR-код участника');
      return;
    }

    try {
      const participant = await MF.lookupByQr(code);
      showParticipant(participant);
      scanMessage('Найден участник: ' + participant.username, 'ok');
      $('manualQr').value = '';
    } catch (err) {
      showParticipant(null);
      scanMessage(err.message);
    }
  }

  /* ---------- начисление ---------- */
  async function submitAward(event) {
    event.preventDefault();
    MF.hideAlert('awardAlert');

    if (!scannedParticipant) {
      MF.showAlert('awardAlert', 'Сначала найдите участника.');
      return;
    }
    if (!selectedTask) {
      MF.showAlert('awardAlert', 'Выберите задание.');
      return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const result = await MF.awardPoints({
        userId: scannedParticipant.id,
        taskId: selectedTask.id,
        points: Number($('awardPoints').value) || 0,
        note: $('awardNote').value.trim(),
      });

      scannedParticipant.totalPoints = result.totalPoints;
      showParticipant(scannedParticipant);
      MF.showAlert('awardAlert', 'Начислено +' + MF.fmtPoints(result.points) + ' участнику ' + scannedParticipant.username, 'ok');

      $('awardNote').value = '';
      await refreshRecent();
    } catch (err) {
      MF.showAlert('awardAlert', err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  /* ---------- последние начисления ---------- */
  async function refreshRecent() {
    const tbody = $('recentAwards');
    try {
      const entries = await MF.getRecentAwards();
      tbody.innerHTML = '';

      if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty" style="padding:10px;">Пока нет начислений</td></tr>';
        return;
      }

      entries.forEach((entry) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + MF.escapeHtml(entry.username) + '</td>' +
          '<td class="small">' + MF.escapeHtml(entry.team || '—') + '</td>' +
          '<td style="color:var(--dashboard);font-weight:700">+' + MF.fmtPoints(entry.points) + '</td>' +
          '<td class="small">' + MF.escapeHtml(entry.note || '—') + '</td>' +
          '<td class="small">' + MF.fmtDate(entry.awardedAt) + '</td>';
        tbody.appendChild(tr);
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty" style="padding:10px;">' + MF.escapeHtml(err.message) + '</td></tr>';
    }
  }

  /* ---------- камера ---------- */
  function startCameraScanner() {
    const Html5Qrcode = window.Html5Qrcode;
    if (window.__mfScannerUnavailable || !Html5Qrcode) return;

    const reader = $('reader');
    reader.innerHTML = '';
    const container = document.createElement('div');
    container.id = 'qr-video-container';
    reader.appendChild(container);

    scanner = new Html5Qrcode('qr-video-container', { verbose: false });
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decodedText) => {
        try { await scanner.stop(); } catch (e) { /* уже остановлен */ }
        reader.innerHTML = '<div style="padding:14px;color:#e2e8f0;">Код считан. Нажмите «Начать камеру» для следующего участника.</div>';
        await lookup(decodedText);
      },
      () => { /* ошибки распознавания кадра игнорируем */ }
    ).catch((err) => {
      reader.innerHTML = '<div style="padding:14px;color:var(--text-muted);">Камера недоступна. Используйте ручной ввод.</div>';
      console.warn('QR scanner start failed', err);
    });
  }

  /* ---------- запуск ---------- */
  (async function boot() {
    const user = await MF.init(['volunteer', 'admin']);
    if (!user) return;

    $('btnLogout').addEventListener('click', () => MF.logout());
    $('btnLookupManual').addEventListener('click', () => lookup($('manualQr').value));
    $('manualQr').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        lookup($('manualQr').value);
      }
    });
    $('awardTask').addEventListener('change', syncTaskFields);
    $('awardForm').addEventListener('submit', submitAward);
    $('awardForm').addEventListener('reset', () => setTimeout(syncTaskFields, 0));

    try {
      tasks = await MF.getTasks(true);
      renderTasksSelect();
      await refreshRecent();
    } catch (err) {
      MF.showFatal(err.message);
      return;
    }

    startCameraScanner();
    setInterval(() => { refreshRecent().catch(() => {}); }, 20000);
  })();
})();
