/* ================= Медиаярмарка — Участник ================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;

  let user = null;
  let pointsTimer = null;
  let refreshing = false;
  let eventActive = true;

  /* ---------- состояние мероприятия ---------- */
  function applyEventState(active) {
    eventActive = !!active;

    ['qrCard', 'snakeCard'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = active ? '' : 'none';
    });

    const banner = $('eventBanner');
    if (banner) {
      if (active) {
        banner.style.display = 'none';
      } else {
        banner.innerHTML = '<b>Мероприятие сейчас не идёт.</b> Управление скрыто организаторами — очки и история остаются доступны.';
        banner.style.display = 'block';
      }
    }
  }

  async function refreshEventState() {
    try {
      const ev = await MF.getEventStatus();
      if (ev.active !== eventActive) applyEventState(ev.active);
    } catch (e) { /* сеть недоступна — оставляем как есть */ }
  }

  /* ---------- очки ---------- */
  async function loadPoints() {
    if (refreshing) return;
    refreshing = true;
    try {
      const data = await MF.getMyPoints();
      $('myPoints').textContent = MF.fmtPoints(data.totalPoints);
      $('pointsHeader').textContent = MF.fmtPoints(data.totalPoints) + ' очков';
      renderHistory(data.entries);
    } finally {
      refreshing = false;
    }
  }

  function renderHistory(entries) {
    const tbody = $('myPointsHistory');
    tbody.innerHTML = '';

    if (!entries || entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty" style="padding:10px;">Пока нет начислений</td></tr>';
      return;
    }

    entries.forEach((entry) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + MF.escapeHtml(entry.note) + '</td>' +
        '<td style="text-align:right;color:var(--dashboard);font-weight:700">+' + MF.fmtPoints(entry.points) + '</td>' +
        '<td class="small">' + MF.fmtDate(entry.awardedAt) + '</td>';
      tbody.appendChild(tr);
    });
  }

  /* ---------- змейка ---------- */
  function initSnake() {
    if (typeof Snake === 'undefined' || !Snake) return;

    $('btnSnakeSave').addEventListener('click', async () => {
      const score = Snake.getScore();
      if (!score || score <= 0) {
        $('snakeMsg').textContent = 'Сначала нажми «Старт» и набери очки.';
        return;
      }

      if (!eventActive) {
        $('snakeMsg').textContent = 'Мероприятие остановлено — сохранение очков недоступно.';
        return;
      }

      const btn = $('btnSnakeSave');
      btn.disabled = true;
      try {
        const result = await MF.saveSnakeScore(score);
        if (result.improved && result.points > 0) {
          $('snakeMsg').textContent = 'Новый рекорд ' + result.best + '! Начислено +' + MF.fmtPoints(result.points) + ' очков.';
        } else if (result.improved) {
          $('snakeMsg').textContent = 'Рекорд ' + result.best + ' сохранён, новых очков нет (настройки начисления).';
        } else {
          $('snakeMsg').textContent = 'Твой рекорд уже ' + result.best + ' — набери больше, чтобы получить очки.';
        }
        $('snakeBest').textContent = result.best;
        await loadPoints();
      } catch (err) {
        $('snakeMsg').textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- запуск ---------- */
  (async function boot() {
    user = await MF.init(['participant']);
    if (!user) return;

    $('qrText').textContent = user.qr || '—';
    MF.generateQRCode('qrContainer', user.qr || 'MF|PART|' + user.id, 260);
    $('btnLogout').addEventListener('click', () => MF.logout());

    try {
      await loadPoints();
      await refreshEventState();
      initSnake();
    } catch (err) {
      MF.showFatal(err.message);
      return;
    }

    pointsTimer = setInterval(() => {
      loadPoints().catch(() => {});
      refreshEventState();
    }, 15000);
    window.addEventListener('beforeunload', () => clearInterval(pointsTimer));
  })();
})();
