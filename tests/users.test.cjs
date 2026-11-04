const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '..');

class Element {
  constructor() {
    this.value = '';
    this.style = {};
    this.children = [];
    this.listeners = {};
    const classes = new Set();
    this.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) };
  }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ''; }
  appendChild(child) { this.children.push(child); }
  prepend(child) { this.children.unshift(child); }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  async emit(type, event = {}) { await this.listeners[type]({ target: this, preventDefault() {}, ...event }); }
  focus() { this.focused = true; }
  reset() {}
  click() { this.clicked = true; }
  remove() {}
  setAttribute() {}
}

async function setup(file = 'users') {
  const html = fs.readFileSync(path.join(root, file + '.html'), 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  const calls = [];
  const users = [
    { id: 'p1', username: 'TeamLogin', role: 'participant', team: 'Орлёнок', qr: 'QR-AbC', members: [{ lastName: 'Семёнов', firstName: 'Алёна', className: '7Б' }] },
    { id: 'v1', username: 'helper', role: 'volunteer', stationId: 's1' },
    { id: 'a1', username: 'boss', role: 'admin' },
  ];
  const tasks = [{ id: 's1', type: 'station', title: 'Съёмка', points: 30, lat: null, lng: null }];
  const record = (name, result) => async (...args) => { calls.push([name, ...args]); return result; };
  const MF = {
    escapeHtml: (value) => String(value).replaceAll('<', '&lt;'), fmtPoints: String,
    ROLE_LABELS: { participant: 'Участник', volunteer: 'Волонтёр', admin: 'Администратор' },
    init: record('init', { role: 'admin' }), getUsers: record('getUsers', users), getTasks: record('getTasks', tasks),
    getLeaderboard: record('getLeaderboard', []), getSettings: record('getSettings', { station_points: 30 }),
    getEventStatus: record('getEventStatus', { active: true }), getSurvey: record('getSurvey', { questions: [] }),
    addUser: record('addUser'), updateUser: record('updateUser'), deleteUser: record('deleteUser'), exportUsers: record('exportUsers', {}),
    hideAlert() {}, showAlert: (...args) => calls.push(['alert', ...args]), showFatal: (message) => { throw new Error(message); }, logout: record('logout'),
  };
  let timer;
  let unload;
  let confirmResult = true;
  const memberForm = { reset: (...args) => calls.push(['rosterReset', ...args]), setEnabled() {}, getMembers: () => undefined };
  const window = {
    __MF: MF, MF_TEAM_FORM: () => memberForm, MF_PRINT: record('print'), MF_API: { requestBlob: record('blob', {}) },
    confirm: (message) => { calls.push(['confirm', message]); return confirmResult; }, alert: (message) => calls.push(['windowAlert', message]),
    addEventListener: (name, fn) => { if (name === 'beforeunload') unload = fn; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, file + '.js'), 'utf8'), {
    window, document: { getElementById: (id) => { assert.ok(elements[id], 'Missing HTML element: ' + id); return elements[id]; }, createElement: () => new Element(), body: new Element(), querySelector: () => elements.addUserModal?.classList.contains('open') ? elements.addUserModal : null },
    console, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout() {},
    setInterval: (fn, delay) => { assert.equal(delay, 30000); timer = fn; return 1; }, clearInterval: (id) => calls.push(['clearInterval', id]),
  });
  await new Promise(setImmediate);
  return { elements, calls, users, tasks, timer: () => timer(), unload: () => unload(), confirm: (value) => { confirmResult = value; } };
}

function action(id, name) {
  const button = { dataset: { id, action: name }, disabled: false };
  return { target: { closest: () => button } };
}

test('search matches all requested fields, normalizes case and ё/е, combines role, and clears accessibly', async () => {
  const { elements: e } = await setup();
  assert.equal(e.usersTableBody.children.length, 3);
  for (const query of ['TEAMLOGIN', 'ОРЛЕНОК', 'семенов', 'АЛЕНА', '7б', 'съемка', 'волонтер', 'QR-abc', 'participant']) {
    e.usersSearch.value = query;
    await e.usersSearch.emit('input');
    assert.equal(e.usersTableBody.children.length, 1, query);
    assert.equal(e.usersCount.textContent, 'Показано: 1 из 3');
  }
  e.usersRoleFilter.value = 'admin';
  await e.usersRoleFilter.emit('change');
  assert.match(e.usersTableBody.innerHTML, /Совпадений нет/);
  await e.btnClearSearch.emit('click');
  assert.equal(e.usersSearch.value, '');
  assert.equal(e.usersSearch.focused, true);
  assert.equal(e.usersTableBody.children.length, 1);
  assert.match(e.usersTableBody.children[0].innerHTML, /boss/);
});

test('polling preserves query and role, skips open modal, refreshes stations, and cleans up', async () => {
  const s = await setup();
  const e = s.elements;
  e.usersSearch.value = 'новая';
  e.usersRoleFilter.value = 'volunteer';
  s.tasks[0].title = 'Новая станция';
  await s.timer();
  assert.equal(e.usersSearch.value, 'новая');
  assert.equal(e.usersRoleFilter.value, 'volunteer');
  assert.equal(e.usersTableBody.children.length, 1);
  await e.btnOpenAddUser.emit('click');
  const before = s.calls.length;
  await s.timer();
  assert.equal(s.calls.length, before);
  s.unload();
  assert.deepEqual(s.calls.at(-1), ['clearInterval', 1]);
});

test('existing user actions, confirmation, QR, credentials and unfiltered export remain wired', async () => {
  const s = await setup();
  const e = s.elements;
  await e.usersTableBody.emit('click', action('p1', 'print'));
  assert.ok(s.calls.some(([name]) => name === 'print'));
  s.confirm(false);
  await e.usersTableBody.emit('click', action('p1', 'delete'));
  assert.ok(!s.calls.some(([name]) => name === 'deleteUser'));
  assert.equal(s.calls.at(-1)[1], 'Удалить пользователя «TeamLogin»? Его очки тоже исчезнут.');
  s.confirm(true);
  await e.usersTableBody.emit('click', action('p1', 'delete'));
  assert.ok(s.calls.some(([name, id]) => name === 'deleteUser' && id === 'p1'));
  await e.usersTableBody.emit('click', action('p1', 'credentials'));
  assert.ok(s.calls.some(([name, url, options]) => name === 'blob' && url === '/users/p1/credentials.xlsx' && options.method === 'POST' && options.body.confirm));
  e.usersSearch.value = 'no matches';
  await e.usersSearch.emit('input');
  await e.btnExportUsers.emit('click');
  assert.deepEqual(s.calls.find(([name]) => name === 'exportUsers'), ['exportUsers']);
});

test('add/edit keeps station validation and legacy optional roster behavior', async () => {
  const s = await setup();
  const e = s.elements;
  e.addUserForm.querySelector = () => new Element();
  await e.btnOpenAddUser.emit('click');
  e.auUsername.value = 'newvolunteer';
  e.auPassword.value = 'password123';
  e.auRole.value = 'volunteer';
  await e.addUserForm.emit('submit');
  assert.ok(!s.calls.some(([name]) => name === 'addUser'));
  e.auStation.value = 's1';
  await e.addUserForm.emit('submit');
  assert.equal(s.calls.find(([name]) => name === 'addUser')[1].stationId, 's1');
  s.users[0].members = [];
  await e.usersTableBody.emit('click', action('p1', 'edit'));
  assert.equal(e.auPassword.required, false);
  assert.equal(s.calls.filter(([name]) => name === 'rosterReset').at(-1)[2].optional, true);
  e.auPassword.value = '';
  e.auTeam.value = 'Обновлённая команда';
  await e.addUserForm.emit('submit');
  const update = s.calls.find(([name]) => name === 'updateUser');
  assert.equal(update[1], 'p1');
  assert.equal(update[2].team, 'Обновлённая команда');
  assert.ok(!('password' in update[2]));
});

test('empty database has a distinct empty message and escaped user content', async () => {
  const s = await setup();
  s.users[0].team = '<img src=x>';
  await s.timer();
  assert.match(s.elements.usersTableBody.children[0].innerHTML, /&lt;img src=x>/);
  s.users.length = 0;
  await s.timer();
  assert.match(s.elements.usersTableBody.innerHTML, /Пользователей пока нет/);
  assert.equal(s.elements.usersCount.textContent, 'Показано: 0 из 0');
});

test('admin boots with no user DOM/dependencies or user API calls', async () => {
  const s = await setup('admin');
  assert.ok(s.calls.some(([name]) => name === 'getTasks'));
  for (const name of ['getLeaderboard', 'getSettings', 'getEventStatus', 'getSurvey']) assert.ok(s.calls.some(([call]) => call === name));
  assert.ok(!s.calls.some(([name]) => name === 'getUsers'));
  const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  assert.match(html, /href="users.html"/);
  assert.doesNotMatch(html, /usersTableBody|addUserModal|team-form.js|print-qr.js|qrcode.min.js/);
  assert.match(html, /admin.js\?v=18/);
  assert.match(fs.readFileSync(path.join(root, 'users.html'), 'utf8'), /users.js\?v=18/);
});
