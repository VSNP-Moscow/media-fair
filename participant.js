/* ================= Медиаярмарка — кабинет команды ================= */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;
  const esc = MF.escapeHtml;
  let user;
  let surveyOpen = false;
  let questions = [];
  let submitted = false;
  let signature = '';
  let refreshing = false;

  function applyFlags(flags) {
    $('qrCard').style.display = flags.active ? '' : 'none';
    $('eventBanner').style.display = flags.active ? 'none' : 'block';
    $('eventBanner').textContent = 'Станции сейчас не работают. Баллы и пройденные этапы сохранены. Опрос открывается организаторами отдельно.';
    surveyOpen = !!flags.surveyOpen;
    $('surveyCard').style.display = surveyOpen && questions.length ? '' : 'none';
  }

  async function loadProgress() {
    const [points, progress] = await Promise.all([MF.getMyPoints(), window.MF_API.request('/tasks/progress')]);
    $('myPoints').textContent = MF.fmtPoints(points.totalPoints);
    $('pointsHeader').textContent = MF.fmtPoints(points.totalPoints) + ' баллов';
    const stages = progress.stages || [];
    $('stageSummary').textContent = 'Пройдено: ' + stages.filter((s) => s.completed).length + ' из ' + stages.length;
    $('stageList').innerHTML = stages.length ? stages.map((stage) =>
      '<article class="survey-q"><div class="survey-q-head"><b>' + esc(stage.title) + '</b>' +
      '<span class="tag' + (stage.completed ? ' points' : '') + '">' + (stage.completed ? 'Пройдено · +' + MF.fmtPoints(stage.earnedPoints) : 'Ещё не пройдено') + '</span></div>' +
      '<p class="small" style="margin-top:8px;">' + esc(stage.description) + '</p></article>'
    ).join('') : '<p class="small">Организаторы готовят список этапов.</p>';
  }

  function renderSurvey() {
    $('surveyCard').style.display = surveyOpen && questions.length ? '' : 'none';
    $('surveyForm').style.display = submitted ? 'none' : '';
    $('surveyResult').innerHTML = submitted ? '<div class="survey-thanks">Спасибо! Ответы вашей команды сохранены.</div>' : '';
    if (submitted) return;
    $('surveyFields').innerHTML = questions.map((question, index) =>
      '<fieldset class="survey-field"><legend>' + (index + 1) + '. ' + esc(question.text) + '</legend>' +
      (question.type === 'text'
        ? '<label for="sq_text_' + index + '">Ваш ответ (до 2000 символов)</label><textarea id="sq_text_' + index + '" name="sq_' + esc(question.id) + '" rows="4" maxlength="2000" required></textarea>'
        : (question.options || []).map((option, choice) => '<label class="survey-choice"><input type="radio" name="sq_' + esc(question.id) + '" value="' + choice + '"><span>' + esc(option) + '</span></label>').join('')) + '</fieldset>'
    ).join('');
  }

  async function loadSurvey(force) {
    const data = await MF.getSurvey();
    surveyOpen = !!data.open;
    const next = data.questions || [];
    const nextSignature = JSON.stringify(next);
    const dirty = !!document.querySelector('#surveyFields input:checked') ||
      Array.from(document.querySelectorAll('#surveyFields textarea')).some((field) => field.value.length > 0);
    if (force || submitted !== !!data.submitted || (!dirty && signature !== nextSignature)) {
      questions = next;
      signature = nextSignature;
      submitted = !!data.submitted;
      renderSurvey();
    } else {
      $('surveyCard').style.display = surveyOpen && questions.length ? '' : 'none';
    }
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const flags = await MF.getEventStatus();
      applyFlags(flags);
      await Promise.all([loadProgress(), loadSurvey(false)]);
    } catch (err) {
      $('stageSummary').textContent = 'Не удалось обновить данные. Повторим автоматически.';
    } finally {
      refreshing = false;
    }
  }

  $('surveyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!surveyOpen) return MF.showAlert('surveyAlert', 'Опрос закрыт организаторами.');
    const answers = [];
    for (let i = 0; i < questions.length; i += 1) {
      if (questions[i].type === 'text') {
        const field = $('sq_text_' + i);
        const text = field.value.trim();
        if (!text || text.length > 2000) {
          field.focus();
          return MF.showAlert('surveyAlert', 'Ответьте на вопрос ' + (i + 1) + ' (до 2000 символов).');
        }
        answers.push(text);
      } else {
        const checked = document.querySelector('input[name="sq_' + questions[i].id + '"]:checked');
        if (!checked) return MF.showAlert('surveyAlert', 'Ответьте на вопрос ' + (i + 1) + '.');
        answers.push(Number(checked.value));
      }
    }
    const btn = $('btnSurveySubmit');
    btn.disabled = true;
    try {
      await MF.submitSurvey(answers);
      submitted = true;
      MF.hideAlert('surveyAlert');
      renderSurvey();
    } catch (err) {
      MF.showAlert('surveyAlert', err.message);
      if (err.status === 409) await loadSurvey(false).catch(() => {});
    } finally {
      btn.disabled = false;
    }
  });

  (async function boot() {
    user = await MF.init(['participant']);
    if (!user) return;
    $('teamTitle').textContent = user.team || user.username;
    $('teamMembers').textContent = (user.members || []).map((m) => m.lastName + ' ' + m.firstName + ' · ' + m.className).join('; ');
    $('qrText').textContent = user.qr;
    MF.generateQRCode('qrContainer', user.qr, 260);
    $('btnLogout').addEventListener('click', () => MF.logout());
    $('btnPrintQr').addEventListener('click', () => window.MF_PRINT(user));
    await refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener('beforeunload', () => clearInterval(timer));
  })();
})();
