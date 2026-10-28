/* ================= Медиаярмарка — Участник ================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;

  let user = null;
  let tasks = [];
  let quizQuestions = [];
  let pointsTimer = null;
  let refreshing = false;

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
        '<td>' + MF.escapeHtml(entry.note) + '</td>' +
        '<td style="text-align:right;color:var(--dashboard);font-weight:700">+' + MF.fmtPoints(entry.points) + '</td>' +
        '<td class="small">' + MF.fmtDate(entry.awardedAt) + '</td>';
      tbody.appendChild(tr);
    });
  }

  /* ---------- карта и список заданий ---------- */
  function renderTaskList() {
    const box = $('taskList');
    box.innerHTML = '';

    const located = tasks.filter((t) => t.lat !== null && t.lng !== null);
    const withoutCoords = tasks.filter((t) => t.lat === null || t.lng === null);
    const list = located.concat(withoutCoords);
    if (list.length === 0) return;

    box.innerHTML = '<div style="font-weight:700;margin-bottom:6px;">Задания ярмарки:</div>';
    list.forEach((t) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:4px 0;color:var(--text-muted);';
      row.textContent = '• ' + t.title + ' — ' + MF.fmtPoints(t.points) + ' очков' +
        (t.description ? ' (' + t.description + ')' : '');
      box.appendChild(row);
    });
  }

  function initMap() {
    if (typeof L === 'undefined') {
      $('mapOffline').style.display = 'block';
      return;
    }

    let map;
    try {
      map = L.map('map').setView([55.7538, 37.6218], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
    } catch (e) {
      $('mapOffline').style.display = 'block';
      return;
    }

    const colors = { station: 'var(--admin)', quiz: 'var(--participant)', game: 'var(--volunteer)' };
    const markers = [];

    tasks.forEach((t) => {
      if (t.lat === null || t.lng === null) return;
      const color = colors[t.type] || 'var(--primary)';
      const icon = L.divIcon({
        className: 'map-marker',
        html: '<div style="background:' + color + ';width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [14, 14],
      });
      const marker = L.marker([t.lat, t.lng], { icon: icon }).addTo(map);
      marker.bindPopup(
        '<b>' + MF.escapeHtml(t.title) + '</b><br>' +
        MF.escapeHtml(t.description || '') + '<br>' +
        '<small>' + MF.fmtPoints(t.points) + ' очков</small>'
      );
      markers.push(marker);
    });

    if (markers.length > 0) {
      map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
    }
  }

  /* ---------- викторина ---------- */
  async function initQuiz() {
    const data = await MF.getQuiz();
    quizQuestions = data.questions;

    const container = $('quizContainer');
    let html = '';

    quizQuestions.forEach((q, i) => {
      html += '<div style="background:#f8fafc;border:1.5px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">' +
        '<div style="font-weight:700;margin-bottom:10px;">' + (i + 1) + '. ' + MF.escapeHtml(q.q) + '</div>' +
        '<div style="display:grid;gap:8px;">' +
        q.options.map((opt, oi) =>
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;">' +
          '<input type="radio" name="q' + i + '" value="' + oi + '" style="accent-color:var(--participant);"> ' +
          MF.escapeHtml(opt) + '</label>'
        ).join('') +
        '</div></div>';
    });

    container.innerHTML = html;

    $('btnQuizSubmit').addEventListener('click', async () => {
      const btn = $('btnQuizSubmit');
      btn.disabled = true;

      const answers = quizQuestions.map((q, i) => {
        const selected = document.querySelector('input[name="q' + i + '"]:checked');
        return selected ? Number(selected.value) : -1;
      });

      try {
        const result = await MF.submitQuiz(answers);
        let message = 'Правильных ответов: ' + result.correct + ' из ' + result.total + '. ';

        if (result.points > 0) {
          message += 'Начислено +' + MF.fmtPoints(result.points) + ' очков. ';
        } else if (result.best > 0) {
          message += 'Это не лучше твоего рекорда (' + result.best + ' из ' + result.total + ') — новых очков нет. ';
        } else {
          message += 'Верных ответов пока нет — попробуй ещё раз. ';
        }
        message += 'Всего на табло: ' + MF.fmtPoints(result.totalPoints) + '.';

        $('quizResult').innerHTML = '<div class="alert ok" style="display:block;">' + MF.escapeHtml(message) + '</div>';
        await loadPoints();
      } catch (err) {
        $('quizResult').innerHTML = '<div class="alert" style="display:block;">' + MF.escapeHtml(err.message) + '</div>';
      } finally {
        btn.disabled = false;
      }
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
        localStorage.setItem('mf_snake_best', String(result.best));
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
      tasks = await MF.getTasks(true);
      renderTaskList();
      initMap();
      await initQuiz();
      initSnake();
    } catch (err) {
      MF.showFatal(err.message);
      return;
    }

    pointsTimer = setInterval(() => { loadPoints().catch(() => {}); }, 15000);
    window.addEventListener('beforeunload', () => clearInterval(pointsTimer));
  })();
})();
