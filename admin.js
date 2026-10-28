/* ================= Медиаярмарка — Администратор ================= */

(function(){
  if (!window.__MF.requireRole(['admin'])) return;

  const $ = (id) => document.getElementById(id);
  const user = window.__MF.getCurrentUser();
  if (user) {
    $('headerUser').textContent = user.username + ' · ' + (user.team || '');
    $('headerRole').className = 'badge ' + user.role;
    $('headerRole').textContent = window.__MF.ROLE_LABELS[user.role];
  }

  $('btnLogout').addEventListener('click', () => window.__MF.logout());
  $('btnRefresh').addEventListener('click', renderAll);

  /* ---------- Пользователи ---------- */
  async function renderUsers() {
    const users = await window.__MF.getUsers();
    const tbody = $('usersTableBody');
    tbody.innerHTML = '';
    const points = window.__MF.getPoints();
    const teamPoints = {};
    points.forEach(p => { teamPoints[p.userId] = (teamPoints[p.userId] || 0) + (p.points || 0); });

    for (const u of users) {
      const tr = document.createElement('tr');
      const total = teamPoints[u.id] || 0;
      const roleLabel = window.__MF.ROLE_LABELS[u.role] || u.role;
      tr.innerHTML =
        `<td><b>${window.__MF.escapeHtml(u.username)}</b></td>` +
        `<td><span class="badge ${u.role}">${roleLabel}</span></td>` +
        `<td>${window.__MF.escapeHtml(u.team || '—')}</td>` +
        `<td style="font-family:ui-monospace;font-size:0.8rem;color:var(--text-muted);word-break:break-all">${window.__MF.escapeHtml(u.qr || '—')}</td>` +
        `<td><span class="tag points">${window.__MF.fmtPoints(total)}</span></td>` +
        `<td>
          <div class="actions">
            <button class="btn-sm" onclick="window.app.editUser('${u.id}')">Ред.</button>
            <button class="btn-sm danger" onclick="window.app.deleteUser('${u.id}','${window.__MF.escapeHtml(u.username)}')">Удалить</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  /* ---------- Задания ---------- */
  function renderTasks() {
    const tasks = window.__MF.getTasks();
    const tbody = $('tasksTableBody');
    tbody.innerHTML = '';
    const typeLabels = { station: 'Станция', quiz: 'Викторина', game: 'Игра' };
    const typeColors = { station: 'var(--admin)', quiz: 'var(--participant)', game: 'var(--volunteer)' };

    tasks.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td><b>${window.__MF.escapeHtml(t.title)}</b><div class="small">${window.__MF.escapeHtml(t.description)}</div></td>` +
        `<td><span class="badge" style="border-color:${typeColors[t.type] || 'var(--border)'};color:${typeColors[t.type] || 'var(--text)'}">${typeLabels[t.type] || t.type}</span></td>` +
        `<td>${window.__MF.fmtPoints(t.points || 0)}</td>` +
        `<td class="small">${(t.lat||'—')}, ${(t.lng||'—')}</td>` +
        `<td>
          <div class="actions">
            <button class="btn-sm" onclick="window.app.editTask('${t.id}')">Ред.</button>
            <button class="btn-sm danger" onclick="window.app.deleteTask('${t.id}','${window.__MF.escapeHtml(t.title)}')">Удалить</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function renderLeaderboard() {
    const board = $('adminLeaderboard');
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

    let html = `<div class="lb-row header"><div style="font-weight:800">#</div><div>Команда</div><div style="text-align:right">Участников</div><div style="text-align:right">Очков</div></div>`;
    rows.forEach((r, i) => {
      const cls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      html += `<div class="lb-row ${cls}">
        <div class="position">${i+1}</div>
        <div class="name">${window.__MF.escapeHtml(r.team)}</div>
        <div style="text-align:right">${r.members}</div>
        <div class="points">${window.__MF.fmtPoints(r.points)}</div>
      </div>`;
    });
    board.innerHTML = html || '<div class="empty">Пока нет участников с очками.</div>';
  }

  function renderAll() { renderUsers(); renderTasks(); renderLeaderboard(); }

  /* ---------- Модалка пользователя ---------- */
  const addUserModal = $('addUserModal');
  $('btnOpenAddUser').addEventListener('click', () => {
    $('addUserForm').reset(); $('addUserAlert').style.display = 'none';
    addUserModal.classList.add('open');
  });
  $('closeAddUser').addEventListener('click', () => addUserModal.classList.remove('open'));
  $('btnCancelAddUser').addEventListener('click', () => addUserModal.classList.remove('open'));
  addUserModal.addEventListener('click', (e) => { if (e.target === addUserModal) addUserModal.classList.remove('open'); });

  $('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Создание...';
    try {
      await window.__MF.addUser({
        username: $('auUsername').value.trim(),
        password: $('auPassword').value,
        role: $('auRole').value,
        team: $('auTeam').value.trim(),
      });
      addUserModal.classList.remove('open');
      renderUsers(); renderLeaderboard();
    } catch (err) {
      document.getElementById('addUserAlert').textContent = err.message;
      document.getElementById('addUserAlert').style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Создать';
    }
  });

  window.app = {
    async editUser(id) {
      const users = await window.__MF.getUsers();
      const u = users.find(x => x.id === id);
      if (!u) return;
      const newTeam = prompt('Новая команда для ' + u.username + ':', u.team || '');
      if (newTeam === null) return;
      window.__MF.updateUser(id, { team: newTeam.trim() });
      renderUsers(); renderLeaderboard();
    },
    async deleteUser(id, username) {
      if (!confirm('Удалить пользователя "' + username + '"?')) return;
      window.__MF.deleteUser(id);
      renderUsers(); renderLeaderboard();
    },
    async editTask(id) {
      const tasks = window.__MF.getTasks();
      const t = tasks.find(x => x.id === id);
      if (!t) return;
      const title = prompt('Название:', t.title);
      if (title === null) return;
      const desc = prompt('Описание:', t.description);
      if (desc === null) return;
      const pts = prompt('Очки:', t.points);
      if (pts === null) return;
      window.__MF.updateTask(id, { title: title.trim(), description: desc.trim(), points: Number(pts) || 0 });
      renderTasks();
    },
    async deleteTask(id, title) {
      if (!confirm('Удалить задание "' + title + '"?')) return;
      window.__MF.deleteTask(id);
      renderTasks();
    },
  };

  /* ---------- Модалка задания ---------- */
  const addTaskModal = $('addTaskModal');
  $('btnOpenAddTask').addEventListener('click', () => {
    $('addTaskForm').reset(); $('addTaskAlert').style.display = 'none';
    addTaskModal.classList.add('open');
  });
  $('closeAddTask').addEventListener('click', () => addTaskModal.classList.remove('open'));
  $('btnCancelAddTask').addEventListener('click', () => addTaskModal.classList.remove('open'));
  addTaskModal.addEventListener('click', (e) => { if (e.target === addTaskModal) addTaskModal.classList.remove('open'); });

  $('addTaskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      window.__MF.addTask({
        title: $('atTitle').value.trim(),
        description: $('atDesc').value.trim(),
        type: $('atType').value,
        points: Number($('atPoints').value) || 0,
        lat: Number($('atLat').value) || 0,
        lng: Number($('atLng').value) || 0,
        createdBy: user.id,
      });
      addTaskModal.classList.remove('open');
      renderTasks();
    } catch (err) {
      document.getElementById('addTaskAlert').textContent = err.message;
      document.getElementById('addTaskAlert').style.display = 'block';
    }
  });

  renderAll();
})();
