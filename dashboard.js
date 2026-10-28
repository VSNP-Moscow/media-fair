/* ================= Медиаярмарка — Табло (dashboard) =================
   Публичный экран: данные берутся из общего API, авторизация не нужна.
   =================================================================== */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;
  const REFRESH_MS = 5000;
  const esc = MF.escapeHtml;

  let timer = null;
  let inFlight = false;

  function renderError(message) {
    $('leaderboard').innerHTML =
      '<div class="lb-row"><div class="empty" style="grid-column:1/-1;padding:28px;">' +
      esc(message) +
      '</div></div>';
    $('lastUpdate').textContent = new Date().toLocaleTimeString('ru-RU');
  }

  async function render() {
    if (inFlight) return;
    inFlight = true;

    try {
      const data = await MF.getDashboard();
      const rows = data.teams || [];

      let html = '<div class="lb-row header">' +
        '<div style="font-weight:800">Место</div>' +
        '<div>Команда</div>' +
        '<div style="text-align:right">Участников</div>' +
        '<div style="text-align:right">Очков</div></div>';

      if (rows.length === 0) {
        html += '<div class="lb-row"><div class="empty" style="padding:28px;grid-column:1/-1;">' +
          'Пока нет участников. Добавьте их в панели администратора.</div></div>';
      } else {
        rows.forEach((row, i) => {
          const medal = i === 0 ? '<span class="crown">👑</span>' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : String(i + 1)));
          const cls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
          html += '<div class="lb-row ' + cls + '">' +
            '<div class="position">' + medal + '</div>' +
            '<div class="name">' + esc(row.team) + '</div>' +
            '<div style="text-align:right">' + row.members + '</div>' +
            '<div class="points">' + MF.fmtPoints(row.points) + '</div>' +
            '</div>';
        });
      }

      $('leaderboard').innerHTML = html;

      if (data.totals) {
        $('totals').innerHTML = 'Участников: <b>' + data.totals.participants + '</b> · ' +
          'Начислений: <b>' + data.totals.awards + '</b> · ' +
          'Всего очков: <b>' + MF.fmtPoints(data.totals.points) + '</b>';
      }

      $('lastUpdate').textContent = new Date().toLocaleTimeString('ru-RU');
    } catch (err) {
      renderError(err.message);
    } finally {
      inFlight = false;
    }
  }

  function startAutoRefresh() {
    if (timer) clearInterval(timer);
    timer = setInterval(async () => {
      await render();
      const el = $('autoRefresh');
      el.style.color = 'var(--dashboard)';
      setTimeout(() => { el.style.color = '#64748b'; }, 800);
    }, REFRESH_MS);
  }

  $('btnRefresh').addEventListener('click', render);
  $('btnPrint').addEventListener('click', () => window.print());

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });

  render();
  startAutoRefresh();
})();
