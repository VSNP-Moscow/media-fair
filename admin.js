/* ================= Медиаярмарка — Администратор ================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;
  const esc = MF.escapeHtml;

  const TYPE_LABELS = { station: 'Станция', quiz: 'Викторина', game: 'Игра' };
  const TYPE_COLORS = { station: 'var(--admin)', quiz: 'var(--participant)', game: 'var(--volunteer)' };

  let users = [];
  let tasks = [];
  let editingUserId = null;
  let editingTaskId = null;

  /* ---------- пользователи ---------- */
  async function loadUsers() {
    users = await MF.getUsers();
    renderUsers();
  }

  function renderUsers() {
    const tbody = $('usersTableBody');
    tbody.innerHTML = '';

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty" style="padding:14px;">Пользователей пока нет. Нажмите «+ Добавить».</td></tr>';
      return;
    }

    users.forEach((u) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><b>' + esc(u.username) + '</b></td>' +
        '<td><span class="badge ' + esc(u.role) + '">' + esc(MF.ROLE_LABELS[u.role] || u.role) + '</span></td>' +
        '<td>' + esc(u.team || '—') + '</td>' +
        '<td style="font-family:ui-monospace;font-size:0.8rem;color:var(--text-muted);word-break:break-all">' + esc(u.qr || '—') + '</td>' +
        '<td><span class="tag points">' + MF.fmtPoints(u.totalPoints || 0) + '</span></td>' +
        '<td><div class="actions">' +
          '<button class="btn-sm" data-action="edit" data-id="' + esc(u.id) + '">Ред.</button>' +
          '<button class="btn-sm danger" data-action="delete" data-id="' + esc(u.id) + '">Удалить</button>' +
        '</div></td>';
      tbody.appendChild(tr);
    });
  }

  /* ---------- задания ---------- */
  async function loadTasks() {
    tasks = await MF.getTasks(true);
    renderTasks();
  }

  function renderTasks() {
    const tbody = $('tasksTableBody');
    tbody.innerHTML = '';

    if (tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty" style="padding:14px;">Заданий пока нет. Нажмите «+ Добавить».</td></tr>';
      return;
    }

    tasks.forEach((t) => {
      const color = TYPE_COLORS[t.type] || 'var(--border)';
      const coords = t.lat !== null && t.lng !== null ? t.lat + ', ' + t.lng : '—';
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><b>' + esc(t.title) + '</b><div class="small">' + esc(t.description || '') + '</div></td>' +
        '<td><span class="badge" style="border-color:' + color + ';color:' + color + '">' + esc(TYPE_LABELS[t.type] || t.type) + '</span></td>' +
        '<td>' + MF.fmtPoints(t.points || 0) + '</td>' +
        '<td class="small">' + esc(coords) + '</td>' +
        '<td><div class="actions">' +
          '<button class="btn-sm" data-action="edit" data-id="' + esc(t.id) + '">Ред.</button>' +
          '<button class="btn-sm danger" data-action="delete" data-id="' + esc(t.id) + '">Удалить</button>' +
        '</div></td>';
      tbody.appendChild(tr);
    });
  }

  /* ---------- табло ---------- */
  async function loadLeaderboard() {
    const board = $('adminLeaderboard');
    const teams = await MF.getLeaderboard();

    let html = '<div class="lb-row header"><div style="font-weight:800">#</div><div>Команда</div>' +
      '<div style="text-align:right">Участников</div><div style="text-align:right">Очков</div></div>';

    if (teams.length === 0) {
      board.innerHTML = html + '<div class="lb-row"><div class="empty" style="grid-column:1/-1;padding:16px;">Пока нет участников.</div></div>';
      return;
    }

    teams.forEach((row, i) => {
      const cls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      html += '<div class="lb-row ' + cls + '">' +
        '<div class="position">' + (i + 1) + '</div>' +
        '<div class="name">' + esc(row.team) + '</div>' +
        '<div style="text-align:right">' + row.members + '</div>' +
        '<div class="points">' + MF.fmtPoints(row.points) + '</div>' +
        '</div>';
    });
    board.innerHTML = html;
  }

  /* ---------- настройки ---------- */
  async function loadSettings() {
    const settings = await MF.getSettings();
    $('setQuizPoints').value = settings.quiz_points_per_correct;
    $('setSnakePoints').value = settings.snake_points_per_score;
    $('setStationPoints').value = settings.station_points;
  }

  /* ---------- модалка пользователя ---------- */
  function openUserModal(user) {
    editingUserId = user ? user.id : null;
    $('modalUserTitle').textContent = user ? 'Изменить пользователя' : 'Новый пользователь';
    $('addUserForm').reset();
    MF.hideAlert('addUserAlert');

    if (user) {
      $('auUsername').value = user.username;
      $('auRole').value = user.role;
      $('auTeam').value = user.team || '';
      $('auPassword').required = false;
      $('passwordHint').style.display = 'block';
    } else {
      $('auPassword').required = true;
      $('passwordHint').style.display = 'none';
    }

    $('addUserModal').classList.add('open');
    $('auUsername').focus();
  }

  function closeUserModal() {
    $('addUserModal').classList.remove('open');
    editingUserId = null;
  }

  /* ---------- модалка задания ---------- */
  function openTaskModal(task) {
    editingTaskId = task ? task.id : null;
    $('modalTaskTitle').textContent = task ? 'Изменить задание' : 'Новое задание';
    $('addTaskForm').reset();
    MF.hideAlert('addTaskAlert');

    if (task) {
      $('atTitle').value = task.title;
      $('atDesc').value = task.description || '';
      $('atType').value = task.type;
      $('atPoints').value = task.points;
      $('atLat').value = task.lat === null ? '' : task.lat;
      $('atLng').value = task.lng === null ? '' : task.lng;
    } else {
      $('atPoints').value = 30;
      $('atLat').value = 55.7538;
      $('atLng').value = 37.6218;
    }

    $('addTaskModal').classList.add('open');
    $('atTitle').focus();
  }

  function closeTaskModal() {
    $('addTaskModal').classList.remove('open');
    editingTaskId = null;
  }

  /* ---------- события ---------- */
  function bindEvents() {
    $('btnLogout').addEventListener('click', () => MF.logout());

    $('btnRefresh').addEventListener('click', async () => {
      try {
        await Promise.all([loadUsers(), loadTasks(), loadSettings(), loadLeaderboard()]);
        MF.showAlert('settingsAlert', 'Данные обновлены.', 'ok');
      } catch (err) {
        MF.showAlert('settingsAlert', err.message);
      }
    });

    /* пользователи */
    $('btnOpenAddUser').addEventListener('click', () => openUserModal(null));
    $('closeAddUser').addEventListener('click', closeUserModal);
    $('btnCancelAddUser').addEventListener('click', closeUserModal);
    $('addUserModal').addEventListener('click', (e) => {
      if (e.target === $('addUserModal')) closeUserModal();
    });

    $('addUserForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const payload = {
        username: $('auUsername').value.trim(),
        role: $('auRole').value,
        team: $('auTeam').value.trim(),
      };
      const password = $('auPassword').value;
      if (password) payload.password = password;

      try {
        if (editingUserId) {
          await MF.updateUser(editingUserId, payload);
        } else {
          if (!password) throw new Error('Задайте пароль новому пользователю');
          await MF.addUser(payload);
        }
        closeUserModal();
        await Promise.all([loadUsers(), loadLeaderboard()]);
      } catch (err) {
        MF.showAlert('addUserAlert', err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });

    $('usersTableBody').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const user = users.find((u) => u.id === btn.dataset.id);
      if (!user) return;

      if (btn.dataset.action === 'edit') {
        openUserModal(user);
        return;
      }

      if (btn.dataset.action === 'delete') {
        if (!window.confirm('Удалить пользователя «' + user.username + '»? Его очки тоже исчезнут.')) return;
        btn.disabled = true;
        try {
          await MF.deleteUser(user.id);
          await Promise.all([loadUsers(), loadLeaderboard()]);
        } catch (err) {
          window.alert(err.message);
          btn.disabled = false;
        }
      }
    });

    /* задания */
    $('btnOpenAddTask').addEventListener('click', () => openTaskModal(null));
    $('closeAddTask').addEventListener('click', closeTaskModal);
    $('btnCancelAddTask').addEventListener('click', closeTaskModal);
    $('addTaskModal').addEventListener('click', (e) => {
      if (e.target === $('addTaskModal')) closeTaskModal();
    });

    $('addTaskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const payload = {
        title: $('atTitle').value.trim(),
        description: $('atDesc').value.trim(),
        type: $('atType').value,
        points: Number($('atPoints').value) || 0,
        lat: $('atLat').value === '' ? null : Number($('atLat').value),
        lng: $('atLng').value === '' ? null : Number($('atLng').value),
      };

      try {
        if (editingTaskId) await MF.updateTask(editingTaskId, payload);
        else await MF.addTask(payload);
        closeTaskModal();
        await loadTasks();
      } catch (err) {
        MF.showAlert('addTaskAlert', err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });

    $('tasksTableBody').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const task = tasks.find((t) => t.id === btn.dataset.id);
      if (!task) return;

      if (btn.dataset.action === 'edit') {
        openTaskModal(task);
        return;
      }

      if (btn.dataset.action === 'delete') {
        if (!window.confirm('Удалить задание «' + task.title + '»? Уже начисленные очки останутся.')) return;
        btn.disabled = true;
        try {
          await MF.deleteTask(task.id);
          await loadTasks();
        } catch (err) {
          window.alert(err.message);
          btn.disabled = false;
        }
      }
    });

    /* настройки */
    $('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await MF.saveSettings({
          quiz_points_per_correct: Number($('setQuizPoints').value),
          snake_points_per_score: Number($('setSnakePoints').value),
          station_points: Number($('setStationPoints').value),
        });
        MF.showAlert('settingsAlert', 'Настройки сохранены.', 'ok');
        setTimeout(() => MF.hideAlert('settingsAlert'), 4000);
      } catch (err) {
        MF.showAlert('settingsAlert', err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  /* ---------- запуск ---------- */
  (async function boot() {
    const user = await MF.init(['admin']);
    if (!user) return;

    bindEvents();
    try {
      await Promise.all([loadUsers(), loadTasks(), loadSettings(), loadLeaderboard()]);
    } catch (err) {
      MF.showFatal(err.message);
    }
  })();
})();
