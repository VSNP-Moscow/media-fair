/* ================= Медиаярмарка — Результаты опросника ================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;
  let refreshing = false;
  let loaded = false;

  function count(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function renderResults(results) {
    const questions = Array.isArray(results.questions) ? results.questions : [];
    $('resultsQuestionCount').textContent = questions.length;
    $('resultsResponses').textContent = count(results.responses);
    $('resultsParticipants').textContent = count(results.totalParticipants);
    const fragment = document.createDocumentFragment();

    questions.forEach((question, index) => {
      const card = element('section', 'card accent-admin result-card');
      const title = element('h3', '', (index + 1) + '. ' + (question.text || 'Вопрос'));
      title.id = 'result-question-' + index;
      card.setAttribute('aria-labelledby', title.id);
      card.appendChild(title);
      const answered = count(question.answered);
      card.appendChild(element('p', 'small', 'Ответили на вопрос: ' + answered +
        (question.type === 'multiple'
          ? ' · Несколько вариантов. Проценты от ответивших на вопрос; сумма может превышать 100%.'
          : question.type === 'text' ? ' · Свободный текст' : ' · Один вариант. Проценты от ответивших на вопрос.')));

      if (question.type === 'text') {
        const answers = Array.isArray(question.textAnswers) ? question.textAnswers : [];
        answers.forEach((answer) => {
          const item = element('article', 'result-answer');
          item.appendChild(element('b', '', answer.team || answer.username || 'Команда без названия'));
          const meta = [answer.username || '', answer.submittedAt ? MF.fmtDate(answer.submittedAt) : ''].filter(Boolean);
          if (meta.length) item.appendChild(element('div', 'small', meta.join(' · ')));
          item.appendChild(element('p', '', answer.text == null ? '' : answer.text));
          card.appendChild(item);
        });
        if (!answers.length) card.appendChild(element('p', 'small', 'Текстовых ответов пока нет.'));
      } else {
        const options = Array.isArray(question.options) ? question.options : [];
        options.forEach((option, optionIndex) => {
          const votes = count((question.counts || [])[optionIndex]);
          const percent = answered > 0 ? Math.round(votes / answered * 100) : 0;
          const row = element('div', 'result-option');
          const label = element('div', 'result-option-label');
          label.appendChild(element('span', '', option));
          label.appendChild(element('b', '', votes + ' · ' + percent + '%'));
          row.appendChild(label);
          const bar = element('div', 'result-bar');
          bar.setAttribute('aria-hidden', 'true');
          const fill = element('div', 'result-bar-fill');
          fill.style.width = Math.min(100, percent) + '%';
          bar.appendChild(fill);
          row.appendChild(bar);
          card.appendChild(row);
        });
        if (!answered) card.appendChild(element('p', 'small', 'Ответов на этот вопрос пока нет.'));
      }
      fragment.appendChild(card);
    });

    if (!questions.length) fragment.appendChild(element('div', 'card empty', 'Вопросов пока нет. Добавьте их в конструкторе на странице администратора.'));
    $('resultsQuestions').replaceChildren(fragment);
  }

  async function refreshResults() {
    if (refreshing) return;
    refreshing = true;
    $('btnRefreshResults').disabled = true;
    $('resultsQuestions').setAttribute('aria-busy', 'true');
    try {
      renderResults(await MF.getSurveyResults());
      loaded = true;
      MF.hideAlert('resultsAlert');
      $('resultsUpdated').textContent = 'Обновлено: ' + new Date().toLocaleString('ru-RU');
    } catch (err) {
      MF.showAlert('resultsAlert', 'Не удалось загрузить результаты: ' + err.message);
      $('resultsUpdated').textContent = loaded
        ? 'Показаны последние загруженные данные. Повторите обновление.'
        : 'Результаты не загружены. Нажмите «Обновить», чтобы повторить.';
    } finally {
      refreshing = false;
      $('btnRefreshResults').disabled = false;
      $('resultsQuestions').setAttribute('aria-busy', 'false');
    }
  }

  async function exportResults() {
    const button = $('btnExportResults');
    button.disabled = true;
    button.textContent = 'Готовим файл…';
    try {
      const blob = await MF.exportSurveyResults();
      const url = URL.createObjectURL(blob);
      const link = element('a');
      link.href = url;
      link.download = 'survey-results-' + new Date().toISOString().slice(0, 10) + '.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      MF.showAlert('resultsAlert', 'Не удалось скачать результаты: ' + err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Скачать Excel';
    }
  }

  (async function boot() {
    try {
      const user = await MF.init(['admin']);
      if (!user) return;
      $('btnLogout').addEventListener('click', () => MF.logout());
      $('btnRefreshResults').addEventListener('click', refreshResults);
      $('btnExportResults').addEventListener('click', exportResults);
      $('btnPrintResults').addEventListener('click', () => window.print());
      await refreshResults();
      const timer = setInterval(refreshResults, 30000);
      window.addEventListener('beforeunload', () => clearInterval(timer));
    } catch (err) {
      MF.showFatal(err.message);
    }
  })();
})();
