/* ================= Медиаярмарка — общая логика (app.js) ================= */

const STORAGE = {
  USERS: 'mf_users',
  TASKS: 'mf_tasks',
  POINTS: 'mf_points',
  QUIZ_RESULTS: 'mf_quiz_results',
  SNAKE_SCORES: 'mf_snake_scores',
  SETTINGS: 'mf_settings',
};

const ROLE_LABELS = {
  admin: 'Администратор',
  participant: 'Участник',
  volunteer: 'Волонтёр',
};

const DEFAULT_SETTINGS = {
  snakePointsPerScore: 1,  // 1 очко за 1 очко в змейке
  quizPointsPerCorrect: 10, // 10 очков за верный ответ
  stationPoints: 50,       // очки за станцию (volunteer awards)
};

let currentUser = null;

/* ---------- хранилище ---------- */
function get(key, def) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? def : JSON.parse(raw);
  } catch (e) {
    return def;
  }
}
function set(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

/* ---------- пароль (простой хэш через SubtleCrypto) ---------- */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'media-fair-salt-2026');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function verifyPassword(password, hash) {
  return (await hashPassword(password)) === hash;
}

/* ---------- сидирование демо-данных (отключено) ---------- */
// Демо-доступ удалён. Администратор создаёт первого пользователя вручную
// через форму регистрации (ниже описание, как добавить первого админа).
function seedDefaultData() {
  // intentionally empty — no demo accounts, no demo tasks
}

/* ---------- пользователи ---------- */
async function getUsers() {
  const users = get(STORAGE.USERS, []);
  // без паролей для списков
  return users.map(({ password, ...rest }) => rest);
}
function getUsersRaw() {
  return get(STORAGE.USERS, []);
}
async function saveUsers(users) {
  set(STORAGE.USERS, users);
}
async function addUser({ username, password, role, team }) {
  const users = getUsersRaw();
  if (users.some(u => u.username === username)) throw new Error('Пользователь с таким логином уже существует');
  const id = 'u' + Date.now();
  const user = {
    id, username, password: await hashPassword(password), role, team,
    qr: 'MF|' + (role === 'admin' ? 'ADMIN' : role === 'volunteer' ? 'VOL' : 'PART') + '|' + id,
    createdAt: Date.now(),
  };
  users.push(user);
  set(STORAGE.USERS, users);
  return { ...user, password: undefined };
}
function updateUser(id, changes) {
  const users = getUsersRaw();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) throw new Error('Пользователь не найден');
  if (changes.password) changes.password = hashPassword(changes.password); // note: async, keep simple below
  Object.assign(users[idx], changes);
  set(STORAGE.USERS, users);
  return users[idx];
}
async function updateUserAsync(id, changes) {
  const users = getUsersRaw();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) throw new Error('Пользователь не найден');
  if (changes.password) changes.password = await hashPassword(changes.password);
  Object.assign(users[idx], changes);
  set(STORAGE.USERS, users);
  return users[idx];
}
function deleteUser(id) {
  let users = getUsersRaw();
  users = users.filter(u => u.id !== id);
  set(STORAGE.USERS, users);
}

/* ---------- задачи ---------- */
function getTasks() { return get(STORAGE.TASKS, []); }
function saveTasks(tasks) { set(STORAGE.TASKS, tasks); }
function addTask(task) {
  const tasks = getTasks();
  const newTask = { id: 't' + Date.now(), ...task, createdAt: Date.now() };
  tasks.push(newTask);
  set(STORAGE.TASKS, tasks);
  return newTask;
}
function updateTask(id, changes) {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Задание не найдено');
  Object.assign(tasks[idx], changes);
  set(STORAGE.TASKS, tasks);
  return tasks[idx];
}
function deleteTask(id) {
  let tasks = getTasks();
  tasks = tasks.filter(t => t.id !== id);
  set(STORAGE.TASKS, tasks);
}

/* ---------- очки ---------- */
function getPoints() { return get(STORAGE.POINTS, []); }
function addPoints({ userId, taskId, points, awardedBy, note }) {
  const pointsList = getPoints();
  const entry = {
    id: 'p' + Date.now(),
    userId, taskId, points: Number(points) || 0,
    awardedBy, awardedAt: Date.now(), note: note || '',
  };
  pointsList.push(entry);
  set(STORAGE.POINTS, pointsList);
  return entry;
}
function getUserTotalPoints(userId) {
  const pointsList = getPoints();
  return pointsList.filter(p => p.userId === userId).reduce((sum, p) => sum + (p.points || 0), 0);
}
function getLeaderboard() {
  const users = getUsersRaw();
  const pointsList = getPoints();
  const totals = {};
  pointsList.forEach(p => { totals[p.userId] = (totals[p.userId] || 0) + (p.points || 0); });
  return users
    .map(u => ({ ...( { password: undefined, ...u }), totalPoints: totals[u.id] || 0 }))
    .filter(u => u.role === 'participant')
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

/* ---------- квизы ---------- */
const QUIZ_QUESTIONS = [
  { q: 'Что значит QR-код?', options: ['Quick Response', 'Quality Record', 'Quick Record'], correct: 0 },
  { q: 'Какой формат файла лучше для фото без потери качества?', options: ['JPG', 'PNG', 'MP4'], correct: 1 },
  { q: 'Что такое стримминг?', options: ['Запись видео', 'Передача видео в реальном времени', 'Монтаж'], correct: 1 },
  { q: 'Какой цвет у освещения «тёплый свет»?', options: ['Синий', 'Оранжевый/жёлтый', 'Зелёный'], correct: 1 },
  { q: 'Что означает контент?', options: ['Наполнение/материал', 'Камера', 'Микрофон'], correct: 0 },
];
function getQuizQuestions() { return QUIZ_QUESTIONS; }
function addQuizResult({ userId, score }) {
  const results = get(STORAGE.QUIZ_RESULTS, []);
  const entry = { id: 'q' + Date.now(), userId, score, takenAt: Date.now() };
  results.push(entry);
  set(STORAGE.QUIZ_RESULTS, results);
  return entry;
}

/* ---------- змейка ---------- */
function addSnakeScore({ userId, score }) {
  const scores = get(STORAGE.SNAKE_SCORES, []);
  const entry = { id: 's' + Date.now(), userId, score, playedAt: Date.now() };
  scores.push(entry);
  set(STORAGE.SNAKE_SCORES, scores);
  return entry;
}

/* ---------- авторизация ---------- */
async function login(username, password) {
  const users = getUsersRaw();
  const user = users.find(u => u.username === username);
  if (!user) throw new Error('Пользователь не найден');
  if (!(await verifyPassword(password, user.password))) throw new Error('Неверный пароль');
  currentUser = { id: user.id, username: user.username, role: user.role, team: user.team, qr: user.qr };
  sessionStorage.setItem('mf_user', JSON.stringify(currentUser));
  return currentUser;
}
function restoreSession() {
  try {
    currentUser = JSON.parse(sessionStorage.getItem('mf_user') || 'null');
  } catch (e) { currentUser = null; }
  return currentUser;
}
function logout() {
  currentUser = null;
  sessionStorage.removeItem('mf_user');
  location.href = 'index.html';
}
function requireRole(allowed) {
  if (!currentUser) { location.href = 'index.html'; return false; }
  if (!allowed.includes(currentUser.role)) {
    alert('Доступ только для: ' + allowed.map(r => ROLE_LABELS[r]).join(', '));
    location.href = 'index.html';
    return false;
  }
  return true;
}
function getCurrentUser() { return currentUser; }

/* ---------- QR ---------- */
function generateQRCode(containerId, text, size = 220) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  try {
    new QRCode(el, {
      text: text,
      width: size,
      height: size,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
  } catch (e) {
    el.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;">QR-библиотека не загружена</div>';
  }
}

/* ---------- утилиты ---------- */
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtPoints(n) {
  return n.toLocaleString('ru-RU');
}
function showAlert(elemId, message, type = 'error') {
  const el = document.getElementById(elemId);
  if (!el) return;
  el.textContent = message;
  el.className = 'alert ' + (type === 'ok' ? 'ok' : '');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function hasUsers() {
  return get(STORAGE.USERS, []).length > 0;
}
window.__MF = {
  STORAGE, ROLE_LABELS, get, set, hashPassword, verifyPassword,
  getUsers, getUsersRaw, saveUsers, addUser, updateUser, updateUserAsync, deleteUser,
  getTasks, saveTasks, addTask, updateTask, deleteTask,
  getPoints, addPoints, getUserTotalPoints, getLeaderboard,
  getQuizQuestions, addQuizResult, addSnakeScore,
  login, restoreSession, logout, requireRole, getCurrentUser,
  generateQRCode, fmtDate, fmtPoints, showAlert, escapeHtml,
  seedDefaultData, hasUsers,
};

// инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  restoreSession();
});
