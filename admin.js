/* ================= Медиаярмарка — Администратор ================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;
  const esc = MF.escapeHtml;
  const TYPE_LABELS = { station: 'Станция', quiz: 'Викторина', game: 'Игра' };
  const TYPE_COLORS = { station: 'var(--admin)', quiz: 'var(--participant)', game: 'var(--volunteer)' };

  let tasks = [];
  let surveyQuestions = [];
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
    const survey = await MF.getSurvey();
    surveyQuestions = survey.questions || [];
    renderSurvey();
  }

  function renderSurvey() {
    const box = $('surveyQuestions');
    const summary = $('surveySummary');
    summary.textContent = 'Вопросов: ' + surveyQuestions.length + ' · Статистика и ответы — на отдельной странице результатов.';

    if (surveyQuestions.length === 0) {
      box.innerHTML = '<div class="empty" style="padding:20px;">Вопросов пока нет. Нажмите «+ Добавить вопрос» — он появится у участников, когда опросник открыт (независимо от мероприятия).</div>';
      return;
    }

    box.innerHTML = surveyQuestions.map((question, index) => {
      const typeLabel = { choice: 'Один вариант', multiple: 'Несколько вариантов', text: 'Свободный текст' }[question.type] || 'Вопрос';

      return '<div class="survey-q">' +
        '<div class="survey-q-head">' +
          '<div><b>' + (index + 1) + '. ' + esc(question.text) + '</b>' +
          '<div class="small" style="margin-top:4px;">' + typeLabel + '</div></div>' +
          '<div class="actions" style="margin-top:0;">' +
            '<button class="btn-sm" data-action="edit" data-id="' + esc(question.id) + '">Ред.</button>' +
            '<button class="btn-sm danger" data-action="delete" data-id="' + esc(question.id) + '">Удалить</button>' +
          '</div>' +
        '</div>' +
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
      $('sqType').value = question.type || 'choice';
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
    $('setStationPoints').value = settings.station_points;
  }

  /* ---------- карта ---------- */
  async function loadMapSummary() {
    const data = await MF.getMapImages();
    const images = data.images || [];
    const floors = Array.from(new Set(images.map((image) => image.floor))).sort();

    if (images.length === 0) {
      $('mapAdminSummary').textContent = 'Карта пока не добавлена. Загрузите до 6 изображений.';
    } else {
      $('mapAdminSummary').textContent = 'Фото: ' + images.length + ' из ' + (data.maxImages || 6) +
        ' · этажи: ' + floors.join(', ') + '.';
    }
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
        await Promise.all([loadTasks(), loadSettings(), loadLeaderboard(), loadEvent(), loadSurvey(), loadMapSummary()]);
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
      if (type !== 'text' && (options.length < 2 || options.length > 8)) {
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
      await Promise.all([loadTasks(), loadSettings(), loadLeaderboard(), loadEvent(), loadMapSummary()]);
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
        const results = await Promise.allSettled([loadLeaderboard(), loadSurvey(), loadEvent(), loadMapSummary()]);
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
