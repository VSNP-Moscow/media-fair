/* ================= Медиаярмарка — Волонтёр ================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;

  let tasks = [];
  let scannedParticipant = null;
  let selectedTask = null;
  let scanner = null;
  let eventActive = true;

  /* ---------- состояние мероприятия ---------- */
  function applyEventState(active) {
    eventActive = !!active;

    const banner = $('eventBanner');
    if (banner) {
      if (active) {
        banner.style.display = 'none';
      } else {
        banner.innerHTML = '<b>Мероприятие остановлено.</b> Начисления закрыты до старта — участников можно находить, но баллы не начисляются.';
        banner.style.display = 'block';
      }
    }

    const submit = $('awardForm').querySelector('button[type="submit"]');
    if (submit) submit.disabled = !active;
  }

  async function refreshEventState() {
    try {
      const ev = await MF.getEventStatus();
      if (ev.active !== eventActive) applyEventState(ev.active);
    } catch (e) { /* офлайн — не блокируем работу сканера */ }
  }

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
    if (!eventActive) {
      MF.showAlert('awardAlert', 'Мероприятие остановлено — начисления закрыты.');
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
  function ensureScannerLibrary() {
    if (window.Html5Qrcode) return Promise.resolve(true);
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      script.onload = () => resolve(!!window.Html5Qrcode);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  function scannerMessage(message, withRetry) {
    const reader = $('reader');
    reader.innerHTML = '';

    const box = document.createElement('div');
    box.style.cssText = 'padding:20px;text-align:center;color:#e2e8f0;';

    const text = document.createElement('div');
    text.style.cssText = 'margin-bottom:12px;font-size:0.9rem;';
    text.textContent = message;
    box.appendChild(text);

    if (withRetry) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-sm primary';
      btn.style.cssText = 'padding:11px 16px;font-size:0.95rem;';
      btn.textContent = '📷 Попробовать снова';
      btn.addEventListener('click', startCameraScanner);
      box.appendChild(btn);
    }

    reader.appendChild(box);
  }

  function resetScannerPrompt() {
    const reader = $('reader');
    reader.innerHTML = '';

    const box = document.createElement('div');
    box.style.cssText = 'padding:20px;text-align:center;';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-sm primary';
    btn.style.cssText = 'padding:12px 18px;font-size:1rem;';
    btn.textContent = '📷 Включить камеру';
    btn.addEventListener('click', startCameraScanner);

    const hint = document.createElement('div');
    hint.className = 'small';
    hint.style.cssText = 'margin-top:10px;color:#94a3b8;';
    hint.textContent = 'Браузер спросит разрешение на камеру. Если кнопка не сработала — введи код вручную.';

    box.appendChild(btn);
    box.appendChild(hint);
    reader.appendChild(box);
  }

  async function startCameraScanner() {
    const reader = $('reader');

    if (!window.Html5Qrcode) {
      reader.innerHTML = '<div style="padding:18px;color:#e2e8f0;">Загружаю сканер…</div>';
      await ensureScannerLibrary();
    }

    const Html5Qrcode = window.Html5Qrcode;

    if (!Html5Qrcode) {
      scannerMessage('Сканер не загрузился — похоже, нет доступа к интернету. Используйте ручной ввод кода.', true);
      return;
    }

    if (scanner) {
      try { scanner.stop(); } catch (e) { /* уже остановлен */ }
      scanner = null;
    }

    reader.innerHTML = '';
    const container = document.createElement('div');
    container.id = 'qr-video-container';
    container.style.width = '100%';
    reader.appendChild(container);

    scanner = new Html5Qrcode('qr-video-container', { verbose: false });

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (decodedText) => {
        try { await scanner.stop(); } catch (e) { /* уже остановлен */ }
        scanner = null;
        reader.innerHTML = '<div style="padding:18px;color:#e2e8f0;">Код считан. Ищу участника…</div>';
        await lookup(decodedText);
        resetScannerPrompt();
      },
      () => { /* ошибки распознавания кадра игнорируем */ }
    ).catch((err) => {
      scanner = null;
      const reason = err && err.message ? String(err.message) : 'браузер не дал доступ к камере';
      scannerMessage('Камера недоступна: ' + reason + '. Введите код вручную.', true);
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
      await refreshEventState();
    } catch (err) {
      MF.showFatal(err.message);
      return;
    }

    resetScannerPrompt();
    setInterval(() => {
      refreshRecent().catch(() => {});
      refreshEventState();
    }, 20000);
  })();
})();
