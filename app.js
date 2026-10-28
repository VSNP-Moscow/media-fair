/* ================= Медиаярмарка — общая логика (app.js) =================
   Все данные хранятся на сервере (API + MySQL). В браузере — только токен.
   ====================================================================== */

var ROLE_LABELS = {
  admin: 'Администратор',
  participant: 'Участник',
  volunteer: 'Волонтёр',
};

var ROLE_PAGES = {
  admin: 'admin.html',
  participant: 'participant.html',
  volunteer: 'volunteer.html',
};

var __mfState = {
  user: null,
  tasks: null,
};

/* ---------- утилиты ---------- */
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtPoints(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  var div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function showAlert(elemId, message, type) {
  var el = document.getElementById(elemId);
  if (!el) return;
  el.textContent = message;
  el.className = 'alert ' + (type === 'ok' ? 'ok' : '');
  el.style.display = 'block';
}

function hideAlert(elemId) {
  var el = document.getElementById(elemId);
  if (el) {
    el.style.display = 'none';
    el.textContent = '';
  }
}

function generateQRCode(containerId, text, size) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  try {
    new QRCode(el, {
      text: text,
      width: size || 220,
      height: size || 220,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
  } catch (e) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">QR-библиотека не загружена</div>';
  }
}

function redirect(page) {
  window.location.href = page;
  return null;
}

/* ---------- фатальная ошибка (нет связи с API) ---------- */
function showFatal(message) {
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;background:#f8fafc;z-index:9999;display:grid;place-items:center;padding:24px;font-family:Arial,sans-serif;';
  box.innerHTML =
    '<div style="max-width:460px;text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">' +
    '<div style="font-size:2rem;margin-bottom:10px;">📡</div>' +
    '<h2 style="margin:0 0 10px;color:#0f172a;font-size:1.2rem;">Сервер недоступен</h2>' +
    '<p style="margin:0 0 18px;color:#475569;font-size:0.95rem;">' + escapeHtml(message || 'Нет связи с сервером.') + '</p>' +
    '<button id="mfRetry" style="background:#6d5efc;color:#fff;border:0;border-radius:10px;padding:11px 20px;font-weight:700;cursor:pointer;">Повторить</button>' +
    '</div>';
  document.body.appendChild(box);
  document.getElementById('mfRetry').addEventListener('click', function () { window.location.reload(); });
}

/* ---------- сессия ---------- */
function getUser() { return __mfState.user; }

function setUser(user) {
  __mfState.user = user || null;
  renderHeader();
}

function renderHeader() {
  var user = __mfState.user;
  if (!user) return;
  var userEl = document.getElementById('headerUser');
  var roleEl = document.getElementById('headerRole');
  if (userEl) userEl.textContent = user.username + (user.team ? ' · ' + user.team : '');
  if (roleEl) {
    roleEl.className = 'badge ' + user.role;
    roleEl.textContent = ROLE_LABELS[user.role] || user.role;
  }
}

async function init(allowedRoles) {
  if (!window.MF_API.getToken()) return redirect('index.html');

  var data;
  try {
    data = await window.MF_API.request('/auth/me');
  } catch (err) {
    if (err.status === 401) {
      window.MF_API.clearToken();
      return redirect('index.html');
    }
    showFatal(err.message);
    return null;
  }

  __mfState.user = data.user;
  renderHeader();

  if (allowedRoles && allowedRoles.indexOf(data.user.role) === -1) {
    return redirect(ROLE_PAGES[data.user.role] || 'index.html');
  }

  return data.user;
}

async function login(username, password) {
  var data = await window.MF_API.request('/auth/login', {
    method: 'POST',
    body: { username: username, password: password },
    auth: false,
  });
  window.MF_API.setToken(data.token);
  __mfState.user = data.user;
  __mfState.tasks = null;
  return data.user;
}

function logout() {
  window.MF_API.clearToken();
  __mfState.user = null;
  __mfState.tasks = null;
  redirect('index.html');
}

/* ---------- первый запуск ---------- */
async function bootstrapStatus() {
  return window.MF_API.request('/auth/bootstrap-status', { auth: false });
}

async function bootstrapAdmin(payload) {
  var data = await window.MF_API.request('/auth/bootstrap', {
    method: 'POST',
    body: payload,
    auth: false,
  });
  window.MF_API.setToken(data.token);
  __mfState.user = data.user;
  return data.user;
}

/* ---------- регистрация участника ---------- */
async function register(payload) {
  var data = await window.MF_API.request('/auth/register', {
    method: 'POST',
    body: payload,
    auth: false,
  });
  window.MF_API.setToken(data.token);
  __mfState.user = data.user;
  return data.user;
}

/* ---------- состояние мероприятия ---------- */
async function getEventStatus() {
  return window.MF_API.request('/event', { auth: false });
}

async function setEvent(payload) {
  return window.MF_API.request('/event', { method: 'PUT', body: payload });
}

/* ---------- пользователи (админ) ---------- */
async function getUsers() {
  return (await window.MF_API.request('/users')).users;
}

async function addUser(payload) {
  return (await window.MF_API.request('/users', { method: 'POST', body: payload })).user;
}

async function updateUser(id, payload) {
  return (await window.MF_API.request('/users/' + encodeURIComponent(id), { method: 'PATCH', body: payload })).user;
}

async function deleteUser(id) {
  await window.MF_API.request('/users/' + encodeURIComponent(id), { method: 'DELETE' });
}

async function lookupByQr(qr) {
  return (await window.MF_API.request('/users/lookup?qr=' + encodeURIComponent(qr))).user;
}

/* ---------- задания ---------- */
async function getTasks(force) {
  if (!__mfState.tasks || force) {
    __mfState.tasks = (await window.MF_API.request('/tasks')).tasks;
  }
  return __mfState.tasks;
}

async function addTask(payload) {
  var task = (await window.MF_API.request('/tasks', { method: 'POST', body: payload })).task;
  __mfState.tasks = null;
  return task;
}

async function updateTask(id, payload) {
  var task = (await window.MF_API.request('/tasks/' + encodeURIComponent(id), { method: 'PATCH', body: payload })).task;
  __mfState.tasks = null;
  return task;
}

async function deleteTask(id) {
  await window.MF_API.request('/tasks/' + encodeURIComponent(id), { method: 'DELETE' });
  __mfState.tasks = null;
}

/* ---------- очки ---------- */
async function awardPoints(payload) {
  return window.MF_API.request('/awards', { method: 'POST', body: payload });
}

async function getMyPoints() {
  return window.MF_API.request('/awards/mine');
}

async function getRecentAwards() {
  return (await window.MF_API.request('/awards/recent')).entries;
}

async function getLeaderboard() {
  return (await window.MF_API.request('/awards/leaderboard')).teams;
}

async function getDashboard() {
  return window.MF_API.request('/awards/dashboard');
}

/* ---------- викторина и змейка ---------- */
async function getQuiz() {
  return window.MF_API.request('/quiz/questions');
}

async function submitQuiz(answers) {
  return window.MF_API.request('/quiz/submit', { method: 'POST', body: { answers: answers } });
}

async function saveSnakeScore(score) {
  return window.MF_API.request('/game/snake', { method: 'POST', body: { score: score } });
}

/* ---------- настройки ---------- */
async function getSettings() {
  return (await window.MF_API.request('/settings')).settings;
}

async function saveSettings(payload) {
  return (await window.MF_API.request('/settings', { method: 'PUT', body: payload })).settings;
}

window.__MF = {
  ROLE_LABELS: ROLE_LABELS,
  ROLE_PAGES: ROLE_PAGES,

  init: init,
  login: login,
  logout: logout,
  getUser: getUser,
  setUser: setUser,
  renderHeader: renderHeader,

  bootstrapStatus: bootstrapStatus,
  bootstrapAdmin: bootstrapAdmin,
  register: register,

  getEventStatus: getEventStatus,
  setEvent: setEvent,

  getUsers: getUsers,
  addUser: addUser,
  updateUser: updateUser,
  deleteUser: deleteUser,
  lookupByQr: lookupByQr,

  getTasks: getTasks,
  addTask: addTask,
  updateTask: updateTask,
  deleteTask: deleteTask,

  awardPoints: awardPoints,
  getMyPoints: getMyPoints,
  getRecentAwards: getRecentAwards,
  getLeaderboard: getLeaderboard,
  getDashboard: getDashboard,

  getQuiz: getQuiz,
  submitQuiz: submitQuiz,
  saveSnakeScore: saveSnakeScore,

  getSettings: getSettings,
  saveSettings: saveSettings,

  fmtDate: fmtDate,
  fmtPoints: fmtPoints,
  escapeHtml: escapeHtml,
  showAlert: showAlert,
  hideAlert: hideAlert,
  generateQRCode: generateQRCode,
  showFatal: showFatal,
};
