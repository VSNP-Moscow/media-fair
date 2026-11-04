/* ================= Медиаярмарка — Пользователи ================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;
  const esc = MF.escapeHtml;
  const memberForm = window.MF_TEAM_FORM($('auMembers'), 'admin-member');
  const legacyRosterHint = document.createElement('p');
  legacyRosterHint.className = 'small';
  legacyRosterHint.textContent = 'У этой учётной записи ещё нет состава команды. Заполните его при возможности (1–3 участника). Пока поля пусты, можно сохранить другие изменения.';
  $('auMembers').prepend(legacyRosterHint);
  let allowEmptyRoster = false;

  let users = [];
  let tasks = [];
  let editingUserId = null;

  /* ---------- пользователи ---------- */
  async function loadUsers() {
    users = await MF.getUsers();
    renderUsers();
  }

  function normalizeSearch(value) {
    return String(value).toLowerCase().replace(/ё/g, 'е');
  }

  function renderUsers() {
    const tbody = $('usersTableBody');
    const query = normalizeSearch($('usersSearch').value.trim());
    const role = $('usersRoleFilter').value;
    const visibleUsers = users.filter((user) => {
      if (role && user.role !== role) return false;
      const station = tasks.find((task) => task.type === 'station' && task.id === user.stationId);
      const fields = [user.username, user.team, user.role, MF.ROLE_LABELS[user.role], user.qr, station && station.title];
      (user.members || []).forEach((member) => fields.push(member.lastName, member.firstName, member.className));
      return normalizeSearch(fields.filter(Boolean).join(' ')).includes(query);
    });
    $('usersCount').textContent = 'Показано: ' + visibleUsers.length + ' из ' + users.length;
    $('btnClearSearch').disabled = !$('usersSearch').value;
    tbody.innerHTML = '';

    if (visibleUsers.length === 0) {
      const message = users.length === 0 ? 'Пользователей пока нет. Нажмите «+ Добавить».' : 'Совпадений нет. Измените запрос или выберите другую роль.';
      tbody.innerHTML = '<tr><td colspan="7" class="empty" style="padding:14px;">' + message + '</td></tr>';
      return;
    }

    visibleUsers.forEach((u) => {
      const tr = document.createElement('tr');
      const station = tasks.find((task) => task.type === 'station' && task.id === u.stationId);
      const stationText = station ? 'Станция: ' + station.title : (u.stationId ? 'Станция недоступна — назначьте другую' : 'Станция не назначена');
      tr.innerHTML =
        '<td><b>' + esc(u.username) + '</b></td>' +
        '<td><span class="badge ' + esc(u.role) + '">' + esc(MF.ROLE_LABELS[u.role] || u.role) + '</span>' +
          (u.role === 'volunteer' ? '<div class="small" style="margin-top:4px;overflow-wrap:anywhere;">' + esc(stationText) + '</div>' : '') + '</td>' +
        '<td>' + esc(u.team || '—') + '</td>' +
        '<td class="small">' + (u.role !== 'participant' ? '—' : (u.members && u.members.length ? u.members.map((member) => esc(member.lastName + ' ' + member.firstName + ' · ' + member.className)).join('<br>') : 'Состав не заполнен')) + '</td>' +
        '<td style="font-family:ui-monospace;font-size:0.8rem;color:var(--text-muted);word-break:break-all">' + esc(u.qr || '—') + '</td>' +
        '<td><span class="tag points">' + MF.fmtPoints(u.totalPoints || 0) + '</span></td>' +
        '<td><div class="actions">' +
          (u.role === 'participant' ? '<button class="btn-sm" data-action="print" data-id="' + esc(u.id) + '">Печать QR</button>' : '') +
          '<button class="btn-sm" data-action="edit" data-id="' + esc(u.id) + '">Ред.</button>' +
          '<button class="btn-sm" data-action="credentials" data-id="' + esc(u.id) + '">Новый пароль + Excel</button>' +
          '<button class="btn-sm danger" data-action="delete" data-id="' + esc(u.id) + '">Удалить</button>' +
        '</div></td>';
      tbody.appendChild(tr);
    });
  }

  async function loadTasks() {
    tasks = await MF.getTasks(true);
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

    allowEmptyRoster = !!(user && user.role === 'participant' && (!user.members || user.members.length === 0));
    memberForm.reset(user && user.members, { optional: allowEmptyRoster });
    populateUserStations(user && user.stationId);
    updateUserRole();
    $('addUserModal').classList.add('open');
    $('auUsername').focus();
  }

  function populateUserStations(stationId) {
    const select = $('auStation');
    select.innerHTML = '<option value="">Выберите станцию</option>' + tasks.filter((task) => task.type === 'station').map((task) =>
      '<option value="' + esc(task.id) + '">' + esc(task.title) + '</option>'
    ).join('');
    select.value = stationId || '';
    updateStationHint();
  }

  function updateStationHint() {
    const hasStations = tasks.some((task) => task.type === 'station');
    $('auStationHint').textContent = !hasStations
      ? 'Станций пока нет. Сначала добавьте задание типа «Станция», затем назначьте его волонтёру. Сохранение волонтёра без станции невозможно.'
      : !$('auStation').value
        ? 'Станция не назначена. Выберите станцию перед сохранением: волонтёр сможет начислять баллы только за неё.'
        : 'Волонтёр сможет начислять баллы только за назначенную станцию.';
  }

  function updateUserRole() {
    const participant = $('auRole').value === 'participant';
    const volunteer = $('auRole').value === 'volunteer';
    $('auTeam').required = participant;
    memberForm.setEnabled(participant);
    legacyRosterHint.hidden = !participant || !allowEmptyRoster;
    $('auStationGroup').hidden = !volunteer;
    $('auStation').disabled = !volunteer;
    $('auStation').required = volunteer;
    updateStationHint();
  }

  function closeUserModal() {
    $('addUserModal').classList.remove('open');
    editingUserId = null;
  }

  /* ---------- события ---------- */
  function bindEvents() {
    $('btnLogout').addEventListener('click', () => MF.logout());
    $('usersSearch').addEventListener('input', renderUsers);
    $('usersRoleFilter').addEventListener('change', renderUsers);
    $('btnClearSearch').addEventListener('click', () => {
      $('usersSearch').value = '';
      renderUsers();
      $('usersSearch').focus();
    });
    $('btnRefresh').addEventListener('click', async () => {
      try {
        await refreshUsers();
        MF.showAlert('usersAlert', 'Данные обновлены.', 'ok');
      } catch (err) {
        MF.showAlert('usersAlert', err.message);
      }
    });

    /* выгрузка пользователей в Excel */
    $('btnExportUsers').addEventListener('click', async () => {
      const btn = $('btnExportUsers');
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Готовлю файл…';
      try {
        const blob = await MF.exportUsers();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'media-fair-users-' + new Date().toISOString().slice(0, 10) + '.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) {
        window.alert('Не удалось выгрузить файл: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });

    /* пользователи */
    $('auRole').addEventListener('change', updateUserRole);
    $('auStation').addEventListener('change', updateStationHint);
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
        const members = memberForm.getMembers();
        if (members !== undefined) payload.members = members;
        if (payload.role === 'participant' && !payload.team) throw new Error('Укажите название команды.');
        if (payload.role === 'volunteer') {
          const stationId = $('auStation').value;
          if (!tasks.some((task) => task.type === 'station' && task.id === stationId)) {
            throw new Error('Назначьте волонтёру станцию перед сохранением. Если станций нет, сначала добавьте станцию.');
          }
          payload.stationId = stationId;
        }
        if (editingUserId) {
          await MF.updateUser(editingUserId, payload);
        } else {
          if (!password) throw new Error('Задайте пароль новому пользователю');
          await MF.addUser(payload);
        }
        closeUserModal();
        await loadUsers();
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

      if (btn.dataset.action === 'print' && user.role === 'participant') {
        try {
          if (typeof window.MF_PRINT !== 'function') throw new Error('Печать QR пока недоступна. Обновите страницу.');
          await window.MF_PRINT(user);
        } catch (err) {
          window.alert(err.message);
        }
        return;
      }

      if (btn.dataset.action === 'credentials') {
        if (!window.confirm('Заменить пароль пользователя «' + user.username + '»? Старый перестанет работать. Excel содержит новый пароль.')) return;
        btn.disabled = true;
        try {
          const blob = await window.MF_API.requestBlob('/users/' + encodeURIComponent(user.id) + '/credentials.xlsx', { method: 'POST', body: { confirm: true } });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'media-fair-access.xlsx';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
          window.alert('Не удалось скачать Excel: ' + err.message + '\nПароль мог уже измениться. Не повторяйте запрос автоматически; проверьте загрузки перед повторной заменой.');
        } finally {
          btn.disabled = false;
        }
        return;
      }

      if (btn.dataset.action === 'edit') {
        openUserModal(user);
        return;
      }

      if (btn.dataset.action === 'delete') {
        if (!window.confirm('Удалить пользователя «' + user.username + '»? Его очки тоже исчезнут.')) return;
        btn.disabled = true;
        try {
          await MF.deleteUser(user.id);
          await loadUsers();
        } catch (err) {
          window.alert(err.message);
          btn.disabled = false;
        }
      }
    });

  }

  async function refreshUsers() {
    await loadTasks();
    await loadUsers();
  }

  /* ---------- запуск ---------- */
  (async function boot() {
    const user = await MF.init(['admin']);
    if (!user) return;

    bindEvents();
    try {
      await refreshUsers();
    } catch (err) {
      MF.showFatal(err.message);
      return;
    }

    let refreshing = false;
    const timer = setInterval(async () => {
      if (refreshing || document.querySelector('.modal-overlay.open')) return;
      refreshing = true;
      try {
        await refreshUsers();
      } catch (err) {
        console.warn('Не удалось обновить пользователей:', err);
      } finally {
        refreshing = false;
      }
    }, 30000);
    window.addEventListener('beforeunload', () => clearInterval(timer));
  })();
})();
