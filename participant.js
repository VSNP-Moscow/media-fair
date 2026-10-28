/* ================= Медиаярмарка — Участник ================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;
  const esc = MF.escapeHtml;

  let user = null;
  let pointsTimer = null;
  let refreshing = false;
  let eventActive = true;
  let surveyQuestions = [];
  let surveySubmitted = false;
  let surveySignature = '';

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

    renderSurvey();
  }

  async function refreshEventState() {
    try {
      const ev = await MF.getEventStatus();
      if (ev.active !== eventActive) {
        applyEventState(ev.active);
        if (ev.active) await loadSurvey();
      }
    } catch (e) { /* сеть недоступна — оставляем как есть */ }
  }

  /* ---------- опросник ---------- */
  function signatureOf(questions) {
    return questions.map((q) => q.id + '|' + q.text + '|' + q.options.join('~')).join('||');
  }

  async function loadSurvey() {
    const data = await MF.getSurvey();
    surveyQuestions = data.questions || [];
    surveySubmitted = !!data.submitted;
    surveySignature = signatureOf(surveyQuestions);
    renderSurvey();
  }

  /* Пока участник не начал отвечать, подхватываем изменения конструктора. */
  async function refreshSurveyIfNeeded() {
    if (!eventActive || surveySubmitted) return;
    if (document.querySelector('#surveyFields input[type="radio"]:checked')) return;

    try {
      const data = await MF.getSurvey();
      const next = data.questions || [];
      const nextSignature = signatureOf(next);

      if (nextSignature !== surveySignature || !!data.submitted !== surveySubmitted) {
        surveyQuestions = next;
        surveySubmitted = !!data.submitted;
        surveySignature = nextSignature;
        renderSurvey();
      }
    } catch (e) { /* сеть недоступна — не мешаем заполнять */ }
  }

  function renderSurvey() {
    const card = $('surveyCard');
    if (!card) return;

    if (!eventActive || surveyQuestions.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';

    const form = $('surveyForm');
    const fields = $('surveyFields');
    const result = $('surveyResult');
    const intro = $('surveyIntro');

    if (surveySubmitted) {
      form.style.display = 'none';
      result.innerHTML = '<div class="survey-thanks">✅ Спасибо! Ваши ответы отправлены организаторам.</div>';
      intro.textContent = 'Вы уже ответили на вопросы опросника.';
      return;
    }

    form.style.display = '';
    result.innerHTML = '';
    intro.textContent = 'Ответьте на несколько вопросов — это поможет организаторам.';

    fields.innerHTML = surveyQuestions.map((question, index) => {
      const choices = question.options.map((option, optionIndex) =>
        '<label class="survey-choice">' +
          '<input type="radio" name="sq_' + esc(question.id) + '" value="' + optionIndex + '">' +
          '<span>' + esc(option) + '</span>' +
        '</label>'
      ).join('');

      return '<fieldset class="survey-field">' +
        '<legend>' + (index + 1) + '. ' + esc(question.text) + '</legend>' +
        choices +
      '</fieldset>';
    }).join('');
  }

  function initSurvey() {
    $('surveyForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!eventActive) {
        MF.showAlert('surveyAlert', 'Мероприятие остановлено — опросник недоступен.');
        return;
      }

      const answers = [];
      for (let i = 0; i < surveyQuestions.length; i += 1) {
        const checked = document.querySelector('input[name="sq_' + surveyQuestions[i].id + '"]:checked');
        if (!checked) {
          MF.showAlert('surveyAlert', 'Ответьте на все вопросы — остался вопрос ' + (i + 1) + '.');
          return;
        }
        answers.push(Number(checked.value));
      }

      const btn = $('btnSurveySubmit');
      btn.disabled = true;
      try {
        await MF.submitSurvey(answers);
        surveySubmitted = true;
        MF.hideAlert('surveyAlert');
        renderSurvey();
      } catch (err) {
        if (err.status === 409) {
          surveySubmitted = true;
          renderSurvey();
        } else {
          MF.showAlert('surveyAlert', err.message);
        }
      } finally {
        btn.disabled = false;
      }
    });
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
        '<td>' + esc(entry.note) + '</td>' +
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
    } catch (err) {
      MF.showFatal(err.message);
      return;
    }

    initSurvey();
    initSnake();

    try {
      await loadSurvey();
    } catch (e) { /* опросник не критичен для страницы */ }

    pointsTimer = setInterval(() => {
      loadPoints().catch(() => {});
      refreshEventState().catch(() => {});
      refreshSurveyIfNeeded().catch(() => {});
    }, 15000);
    window.addEventListener('beforeunload', () => clearInterval(pointsTimer));
  })();
})();
