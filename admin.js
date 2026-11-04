/* ================= Медиаярмарка — Администратор ================= */

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

  const TYPE_LABELS = { station: 'Станция', quiz: 'Викторина', game: 'Игра' };
  const TYPE_COLORS = { station: 'var(--admin)', quiz: 'var(--participant)', game: 'var(--volunteer)' };

  let users = [];
  let tasks = [];
  let surveyQuestions = [];
  let surveyTotals = { totalParticipants: 0, responses: 0 };
  let editingUserId = null;
  let editingTaskId = null;
  let editingQuestionId = null;

  /* ---------- мероприятие ---------- */
  let eventState = { active: true, registrationOpen: true, surveyOpen: false };

  async function loadEvent() {
    eventState = await MF.getEventStatus();
    renderEvent();
  }

  function renderEvent() {
    const badge = $('eventBadge');
    const btn = $('btnToggleEvent');
    const hint = $('eventHint');

    $('chkRegistration').checked = !!eventState.registrationOpen;
    const surveyBtn = $('btnToggleSurvey');
    surveyBtn.disabled = false;
    surveyBtn.textContent = eventState.surveyOpen ? 'Закрыть опросник' : 'Открыть опросник';
    surveyBtn.setAttribute('aria-pressed', String(!!eventState.surveyOpen));
    $('surveyStatus').textContent = eventState.surveyOpen ? 'Опросник открыт' : 'Опросник закрыт';

    if (eventState.active) {
      badge.textContent = '● Мероприятие идёт';
      badge.style.cssText = 'background:#f0fdf4;color:#16a34a;border-color:#bbf7d0;';
      btn.textContent = '⏹ Остановить мероприятие';
      btn.style.cssText = 'width:auto;background:var(--danger);border-color:transparent;color:#fff;';
      hint.textContent = 'Станции работают, волонтёры могут начислять баллы. Опросник открывается и закрывается независимо от мероприятия.';
    } else {
      badge.textContent = '⏸ Остановлено';
      badge.style.cssText = 'background:#fef2f2;color:#dc2626;border-color:#fecaca;';
      btn.textContent = '▶ Начать мероприятие';
      btn.style.cssText = 'width:auto;';
      hint.textContent = 'Станции остановлены, волонтёры не могут начислять баллы. Очки и история сохраняются. Опросник работает независимо от мероприятия.';
    }
  }

  /* ---------- опросник ---------- */
  async function loadSurvey() {
    const results = await MF.getSurveyResults();
    surveyQuestions = results.questions || [];
    surveyTotals = { totalParticipants: results.totalParticipants, responses: results.responses };
    renderSurvey();
  }

  function renderSurvey() {
    const box = $('surveyQuestions');
    const summary = $('surveySummary');
    const total = surveyTotals.totalParticipants || 0;
    const answered = surveyTotals.responses || 0;

    summary.textContent = 'Вопросов: ' + surveyQuestions.length + ' · Ответили: ' + answered + ' из ' + total + ' участников';

    if (surveyQuestions.length === 0) {
      box.innerHTML = '<div class="empty" style="padding:20px;">Вопросов пока нет. Нажмите «+ Добавить вопрос» — он появится у участников, когда опросник открыт (независимо от мероприятия).</div>';
      return;
    }

    box.innerHTML = surveyQuestions.map((question, index) => {
      const options = question.type === 'text'
        ? (question.textAnswers || []).map((answer) =>
          '<div class="survey-q"><b>' + esc(answer.team || answer.username || 'Команда без названия') + '</b>' +
          '<div class="small">' + esc(answer.username || '') + (answer.submittedAt ? ' · ' + esc(MF.fmtDate(answer.submittedAt)) : '') + '</div>' +
          '<div style="margin-top:8px;white-space:pre-wrap;overflow-wrap:anywhere;">' + esc(answer.text) + '</div></div>'
        ).join('') || '<div class="small">Текстовых ответов пока нет.</div>'
        : (question.options || []).map((option, optionIndex) => {
          const count = question.counts[optionIndex] || 0;
          const percent = answered > 0 ? Math.round((count / answered) * 100) : 0;
          return '<div class="survey-option"><span>' + esc(option) + '</span><b>' + count + ' · ' + percent + '%</b></div>';
        }).join('');

      return '<div class="survey-q">' +
        '<div class="survey-q-head">' +
          '<div><b>' + (index + 1) + '. ' + esc(question.text) + '</b>' +
          '<div class="small" style="margin-top:4px;">Ответили: ' + question.answered + ' из ' + answered + '</div></div>' +
          '<div class="actions" style="margin-top:0;">' +
            '<button class="btn-sm" data-action="edit" data-id="' + esc(question.id) + '">Ред.</button>' +
            '<button class="btn-sm danger" data-action="delete" data-id="' + esc(question.id) + '">Удалить</button>' +
          '</div>' +
        '</div>' +
        '<div class="survey-options">' + options + '</div>' +
      '</div>';
    }).join('');
  }

  function openSurveyModal(question) {
    editingQuestionId = question ? question.id : null;
    $('surveyModalTitle').textContent = question ? 'Изменить вопрос' : 'Новый вопрос';
    $('surveyForm').reset();
    MF.hideAlert('surveyModalAlert');

    if (question) {
      $('sqText').value = question.text;
      $('sqType').value = question.type === 'text' ? 'text' : 'choice';
      $('sqOptions').value = (question.options || []).join('\n');
    }
    updateSurveyType();

    $('surveyModal').classList.add('open');
    $('sqText').focus();
  }

  function updateSurveyType() {
    const text = $('sqType').value === 'text';
    $('sqOptionsGroup').hidden = text;
    $('sqOptions').disabled = text;
    $('sqOptions').required = !text;
  }

  function closeSurveyModal() {
    $('surveyModal').classList.remove('open');
    editingQuestionId = null;
  }

  /* ---------- пользователи ---------- */
  async function loadUsers() {
    users = await MF.getUsers();
    renderUsers();
  }

  function renderUsers() {
    const tbody = $('usersTableBody');
    tbody.innerHTML = '';

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty" style="padding:14px;">Пользователей пока нет. Нажмите «+ Добавить».</td></tr>';
      return;
    }

    users.forEach((u) => {
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
          '<button class="btn-sm danger" data-action="delete" data-id="' + esc(u.id) + '">Удалить</button>' +
        '</div></td>';
      tbody.appendChild(tr);
    });
  }

  /* ---------- задания ---------- */
  async function loadTasks() {
    tasks = await MF.getTasks(true);
    renderTasks();
    renderUsers();
    if ($('addUserModal').classList.contains('open')) {
      populateUserStations($('auStation').value);
    }
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
      $('atLat').value = task.lat == null ? '' : task.lat;
      $('atLng').value = task.lng == null ? '' : task.lng;
    } else {
      $('atType').value = 'station';
      $('atPoints').value = 30;
      $('atLat').value = '';
      $('atLng').value = '';
    }
    $('taskTypeHint').textContent = 'Тип: ' + (TYPE_LABELS[$('atType').value] || $('atType').value) + (task ? ' (сохраняется).' : ' (волонтёр).');

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
        await Promise.all([loadUsers(), loadTasks(), loadSettings(), loadLeaderboard(), loadEvent(), loadSurvey()]);
        MF.showAlert('settingsAlert', 'Данные обновлены.', 'ok');
      } catch (err) {
        MF.showAlert('settingsAlert', err.message);
      }
    });

    /* мероприятие */
    $('btnToggleEvent').addEventListener('click', async () => {
      const btn = $('btnToggleEvent');
      const next = !eventState.active;

      if (!next && !window.confirm('Остановить станции? Волонтёры не смогут начислять баллы. Доступность опросника не изменится.')) {
        return;
      }

      btn.disabled = true;
      try {
        const res = await MF.setEvent({ active: next });
        eventState.active = res.active;
        renderEvent();
        MF.showAlert('eventAlert', next ? 'Мероприятие начато.' : 'Мероприятие остановлено.', 'ok');
        setTimeout(() => MF.hideAlert('eventAlert'), 4000);
      } catch (err) {
        MF.showAlert('eventAlert', err.message);
      } finally {
        btn.disabled = false;
      }
    });

    $('chkRegistration').addEventListener('change', async () => {
      const box = $('chkRegistration');
      box.disabled = true;
      try {
        const res = await MF.setEvent({ registrationOpen: box.checked });
        eventState.registrationOpen = res.registrationOpen;
        box.checked = res.registrationOpen;
      } catch (err) {
        box.checked = !box.checked;
        MF.showAlert('eventAlert', err.message);
      } finally {
        box.disabled = false;
      }
    });

    /* опросник */
    $('btnToggleSurvey').addEventListener('click', async () => {
      const btn = $('btnToggleSurvey');
      const next = !eventState.surveyOpen;
      btn.disabled = true;
      try {
        const res = await MF.setEvent({ surveyOpen: next });
        eventState.surveyOpen = res.surveyOpen;
        renderEvent();
        MF.showAlert('surveyAlert', eventState.surveyOpen ? 'Опросник открыт.' : 'Опросник закрыт.', 'ok');
      } catch (err) {
        MF.showAlert('surveyAlert', err.message);
      } finally {
        btn.disabled = false;
      }
    });
    $('sqType').addEventListener('change', updateSurveyType);
    $('btnAddQuestion').addEventListener('click', () => openSurveyModal(null));
    $('closeSurveyModal').addEventListener('click', closeSurveyModal);
    $('btnCancelSurvey').addEventListener('click', closeSurveyModal);
    $('surveyModal').addEventListener('click', (e) => {
      if (e.target === $('surveyModal')) closeSurveyModal();
    });

    $('surveyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const text = $('sqText').value.trim();
      const type = $('sqType').value;
      const options = type === 'text' ? [] : $('sqOptions').value.split('\n').map((line) => line.trim()).filter(Boolean);

      if (text.length < 3) {
        MF.showAlert('surveyModalAlert', 'Вопрос: минимум 3 символа.');
        return;
      }
      if (type === 'choice' && (options.length < 2 || options.length > 8)) {
        MF.showAlert('surveyModalAlert', 'Нужно от 2 до 8 вариантов ответа — по одному в строке.');
        return;
      }

      submitBtn.disabled = true;
      const wasEditing = !!editingQuestionId;
      try {
        if (editingQuestionId) {
          await MF.updateSurveyQuestion(editingQuestionId, { text: text, type: type, options: options });
        } else {
          await MF.addSurveyQuestion({ text: text, type: type, options: options });
        }
        closeSurveyModal();
        await loadSurvey();
        MF.showAlert('surveyAlert', wasEditing ? 'Вопрос обновлён.' : 'Вопрос добавлен.', 'ok');
        setTimeout(() => MF.hideAlert('surveyAlert'), 4000);
      } catch (err) {
        MF.showAlert('surveyModalAlert', err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });

    $('surveyQuestions').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const question = surveyQuestions.find((q) => q.id === btn.dataset.id);
      if (!question) return;

      if (btn.dataset.action === 'edit') {
        openSurveyModal(question);
        return;
      }

      if (btn.dataset.action === 'delete') {
        if (!window.confirm('Удалить вопрос «' + question.text + '»? Ответы на него перестанут учитываться.')) return;
        btn.disabled = true;
        try {
          await MF.deleteSurveyQuestion(question.id);
          await loadSurvey();
        } catch (err) {
          window.alert(err.message);
          btn.disabled = false;
        }
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

      if (btn.dataset.action === 'print' && user.role === 'participant') {
        try {
          if (typeof window.MF_PRINT !== 'function') throw new Error('Печать QR пока недоступна. Обновите страницу.');
          await window.MF_PRINT(user);
        } catch (err) {
          window.alert(err.message);
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
      await Promise.all([loadUsers(), loadTasks(), loadSettings(), loadLeaderboard(), loadEvent()]);
    } catch (err) {
      MF.showFatal(err.message);
      return;
    }

    loadSurvey().catch((err) => {
      $('surveySummary').textContent = 'Не удалось загрузить опросник: ' + err.message;
    });

    let refreshing = false;
    const timer = setInterval(async () => {
      if (refreshing || document.querySelector('.modal-overlay.open')) return;
      refreshing = true;
      try {
        const results = await Promise.allSettled([loadUsers(), loadLeaderboard(), loadSurvey(), loadEvent()]);
        results.forEach((result) => {
          if (result.status === 'rejected') console.warn('Не удалось обновить данные администратора:', result.reason);
        });
      } finally {
        refreshing = false;
      }
    }, 30000);
    window.addEventListener('beforeunload', () => clearInterval(timer));
  })();
})();
