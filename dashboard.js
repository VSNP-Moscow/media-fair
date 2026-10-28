/* ================= Медиаярмарка — Табло (dashboard) ================= */

(function(){
  const $ = (id) => document.getElementById(id);
  const REFRESH_MS = 5000;
  let timer = null;

  function render(){
    const lb = window.__MF.getLeaderboard();
    const teams = {};
    lb.forEach(u => {
      const key = u.team || 'Без команды';
      if (!teams[key]) teams[key] = { members: [], points: 0 };
      teams[key].members.push(u);
      teams[key].points += u.totalPoints;
    });
    const rows = Object.entries(teams).map(([team, data]) => ({ team, members: data.members.length, points: data.points }))
      .sort((a, b) => b.points - a.points);

    const board = $('leaderboard');
    let html = `<div class="lb-row header"><div style="font-weight:800">Место</div><div>Команда</div><div style="text-align:right">Участников</div><div style="text-align:right">Очков</div></div>`;
    if (rows.length === 0) {
      html += `<div class="lb-row empty-row"><div class="empty" style="padding:28px;grid-column:1/-1;">Пока нет участников с очками. Начисляйте баллы у волонтёра на станциях.</div></div>`;
    } else {
      rows.forEach((r, i) => {
        const medal = i === 0 ? '<span class="crown">👑</span>' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : (i+1)));
        const cls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
        html += `<div class="lb-row ${cls}">
          <div class="position">${medal}</div>
          <div class="name">${window.__MF.escapeHtml(r.team)}</div>
          <div style="text-align:right">${r.members}</div>
          <div class="points">${window.__MF.fmtPoints(r.points)}</div>
        </div>`;
      });
    }
    board.innerHTML = html;
    $('lastUpdate').textContent = new Date().toLocaleTimeString('ru-RU');
  }

  function startAutoRefresh(){
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      render();
      const el = $('autoRefresh');
      el.style.color = 'var(--dashboard)';
      setTimeout(() => { el.style.color = '#64748b'; }, 800);
    }, REFRESH_MS);
  }

  $('btnRefresh').addEventListener('click', render);
  $('btnPrint').addEventListener('click', () => window.print());

  render();
  startAutoRefresh();
  window.addEventListener('storage', render);
})();
