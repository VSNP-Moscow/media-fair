/* ================= Медиаярмарка — Участник ================= */

(function(){
  if (!window.__MF.requireRole(['participant'])) return;

  const $ = (id) => document.getElementById(id);
  const user = window.__MF.getCurrentUser();
  if (!user) return;

  $('headerUser').textContent = user.username + ' · ' + (user.team || '');
  $('headerRole').className = 'badge participant';
  $('headerRole').textContent = 'Участник';

  /* ---------- QR ---------- */
  $('qrText').textContent = user.qr || '—';
  window.__MF.generateQRCode('qrContainer', user.qr || 'MF|PART|' + user.id, 260);

  /* ---------- очки ---------- */
  function updatePointsUI(){
    const total = window.__MF.getUserTotalPoints(user.id);
    $('myPoints').textContent = window.__MF.fmtPoints(total);
    $('pointsHeader').textContent = window.__MF.fmtPoints(total) + ' очков';
    const points = window.__MF.getPoints().filter(p => p.userId === user.id).slice().sort((a,b)=>b.awardedAt-a.awardedAt);
    const tbody = $('myPointsHistory');
    tbody.innerHTML = '';
    if (points.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty" style="padding:10px;">Пока нет начислений</td></tr>';
    } else {
      points.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${window.__MF.escapeHtml(p.note || p.taskId || 'Начисление')}</td><td style="text-align:right;color:var(--dashboard);font-weight:700">+${window.__MF.fmtPoints(p.points)}</td><td class="small">${window.__MF.fmtDate(p.awardedAt)}</td>`;
        tbody.appendChild(tr);
      });
    }
  }
  updatePointsUI();

  /* ---------- задачи / карта ---------- */
  const tasks = window.__MF.getTasks();
  const typeLabels = { station: 'Станция', quiz: 'Викторина', game: 'Игра' };

  let map = null;
  try {
    map = L.map('map').setView([55.7538, 37.6218], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const icons = {
      station: L.divIcon({className:'map-marker',html:'<div style="background:var(--admin);width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',iconSize:[14,14]}),
      quiz: L.divIcon({className:'map-marker',html:'<div style="background:var(--participant);width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',iconSize:[14,14]}),
      game: L.divIcon({className:'map-marker',html:'<div style="background:var(--volunteer);width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',iconSize:[14,14]})
    };

    tasks.forEach(t => {
      if (!t.lat || !t.lng) return;
      const marker = L.marker([t.lat, t.lng], {icon: icons[t.type]}).addTo(map);
      marker.bindPopup(`<b>${window.__MF.escapeHtml(t.title)}</b><br>${window.__MF.escapeHtml(t.description)}<br><small>${typeLabels[t.type]} · ${window.__MF.fmtPoints(t.points||0)} очков</small>`);
    });
  } catch (e) {
    $('mapOffline').style.display = 'block';
    console.warn('Карта не инициализирована:', e);
  }

  /* ---------- викторина ---------- */
  const questions = window.__MF.getQuizQuestions();
  const quizContainer = $('quizContainer');
  let quizHtml = '';
  questions.forEach((q, i) => {
    quizHtml += `<div style="background:#f8fafc;border:1.5px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="font-weight:700;margin-bottom:10px;">${i+1}. ${window.__MF.escapeHtml(q.q)}</div>
      <div style="display:grid;gap:8px;">
        ${q.options.map((opt, oi) => `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;">
          <input type="radio" name="q${i}" value="${oi}" style="accent-color:var(--participant);"> ${window.__MF.escapeHtml(opt)}
        </label>`).join('')}
      </div>
    </div>`;
  });
  quizContainer.innerHTML = quizHtml;

  $('btnQuizSubmit').addEventListener('click', () => {
    let correct = 0;
    questions.forEach((q, i) => {
      const selected = document.querySelector('input[name="q'+i+'"]:checked');
      if (selected && Number(selected.value) === q.correct) correct += 1;
    });
    const settings = window.__MF.get(window.__MF.SETTINGS) || {};
    const pointsEarned = correct * Number(settings.quizPointsPerCorrect || 10);
    const task = tasks.find(t => t.type === 'quiz');
    window.__MF.addPoints({
      userId: user.id, taskId: task ? task.id : 'quiz',
      points: pointsEarned, awardedBy: user.id,
      note: 'Викторина: ' + correct + '/' + questions.length + ' верных',
    });
    $('quizResult').innerHTML = `<div class="alert ok" style="display:block;">Ты набрал ${correct} из ${questions.length}. Начислено +${window.__MF.fmtPoints(pointsEarned)} очков!</div>`;
    updatePointsUI();
  });

  /* ---------- змейка ---------- */
  const snakeBtnSave = $('btnSnakeSave');
  const snakeMsg = $('snakeMsg');
  snakeBtnSave.addEventListener('click', () => {
    const score = Snake.getScore();
    if (score <= 0) { snakeMsg.textContent = 'Сначала нажми «Старт» и набери очки.'; return; }
    const task = tasks.find(t => t.type === 'game');
    window.__MF.addSnakeScore({ userId: user.id, score });
    window.__MF.addPoints({
      userId: user.id, taskId: task ? task.id : 'snake',
      points: score, awardedBy: user.id,
      note: 'Змейка: ' + score + ' очков',
    });
    updatePointsUI();
    snakeMsg.textContent = 'Сохранено: +' + window.__MF.fmtPoints(score) + ' очков на табло!';
    setTimeout(() => { snakeMsg.textContent = ''; }, 3000);
  });

  window.addEventListener('storage', () => updatePointsUI());
  updatePointsUI();
})();
