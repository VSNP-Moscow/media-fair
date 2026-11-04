'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { HttpError, ah, str, roleOf, idOf, ROLE_LABELS } = require('../util');
const { hashPassword, requireAuth, requireRole } = require('../auth');
const { buildXlsx } = require('../xlsx');
const { normalizeMembers, readMembers, saveMembers } = require('../team');

const router = express.Router();

const QR_PREFIX = { admin: 'ADMIN', participant: 'PART', volunteer: 'VOL' };

function stationFor(role, value, required) {
  if (role !== 'volunteer') {
    if (value !== undefined && value !== null && value !== '') {
      throw new HttpError(400, 'Станцию можно назначить только волонтёру');
    }
    return null;
  }
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'Волонтёру необходимо назначить станцию');
  }
  return idOf(value, 'Станция');
}

async function saveStation(conn, userId, stationId) {
  if (stationId === undefined) return;
  if (stationId === null) {
    await conn.query('DELETE FROM volunteer_stations WHERE user_id = ?', [userId]);
    return;
  }
  const [tasks] = await conn.query('SELECT id, type FROM tasks WHERE id = ? FOR UPDATE', [stationId]);
  if (!tasks.length) throw new HttpError(400, 'Назначенная станция не найдена');
  if (tasks[0].type !== 'station') throw new HttpError(400, 'Назначить можно только задание типа «станция»');
  await conn.query(
    'INSERT INTO volunteer_stations (user_id, task_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE task_id = VALUES(task_id)',
    [userId, stationId]
  );
}

async function adminCount() {
  const row = await db.one("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
  return Number(row.total);
}

function listSql() {
  return `
    SELECT u.id, u.username, u.role, u.team, u.qr, u.created_at, vs.task_id AS stationId,
           COALESCE(p.pts, 0) AS total_points
      FROM users u
      LEFT JOIN volunteer_stations vs ON vs.user_id = u.id AND u.role = 'volunteer'
      LEFT JOIN (SELECT user_id, SUM(points) AS pts FROM awards GROUP BY user_id) p
             ON p.user_id = u.id
     ORDER BY FIELD(u.role, 'admin', 'volunteer', 'participant'), u.username`;
}

async function listUsers() {
  const users = await db.query(listSql());
  const memberRows = await db.query('SELECT user_id, first_name AS firstName, last_name AS lastName, class_name AS className FROM team_members ORDER BY user_id, position');
  const membersByUser = new Map();
  for (const member of memberRows) {
    if (!membersByUser.has(member.user_id)) membersByUser.set(member.user_id, []);
    membersByUser.get(member.user_id).push({ firstName: member.firstName, lastName: member.lastName, className: member.className });
  }
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    team: u.team,
    qr: u.qr,
    stationId: u.stationId || null,
    totalPoints: Number(u.total_points),
    createdAt: Number(u.created_at),
    members: membersByUser.get(u.id) || [],
  }));
}

router.get('/', requireAuth, requireRole('admin'), ah(async (req, res) => {
  res.json({ users: await listUsers() });
}));

/** Выгрузка списка пользователей в Excel (.xlsx). */
router.get('/export.xlsx', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const rows = await listUsers();

  const dateFormat = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  });

  const data = [
    ['Логин', 'Роль', 'Команда', 'QR-код', 'Очки', 'Дата регистрации', 'Участник 1: имя', 'Участник 1: фамилия', 'Участник 1: класс', 'Участник 2: имя', 'Участник 2: фамилия', 'Участник 2: класс', 'Участник 3: имя', 'Участник 3: фамилия', 'Участник 3: класс'],
  ];

  rows.forEach((user) => {
    data.push([
      user.username,
      ROLE_LABELS[user.role] || user.role,
      user.team || '',
      user.qr || '',
      user.totalPoints,
      dateFormat.format(new Date(user.createdAt)),
      ...[0, 1, 2].flatMap((index) => {
        const member = user.members[index];
        return member ? [member.firstName, member.lastName, member.className] : ['', '', ''];
      }),
    ]);
  });

  const buffer = buildXlsx({
    sheetName: 'Пользователи',
    columns: [24, 16, 28, 24, 10, 20, 22, 24, 18, 22, 24, 18, 22, 24, 18],
    rows: data,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = 'media-fair-users-' + stamp + '.xlsx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}));

router.post('/', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const username = str(req.body.username, { field: 'Логин', min: 3, max: 32 });
  const password = str(req.body.password, { field: 'Пароль', min: 6, max: 72, trim: false });
  const role = roleOf(req.body.role);
  const stationId = stationFor(role, req.body.stationId, true);
  if (req.body.team !== undefined && typeof req.body.team !== 'string') {
    throw new HttpError(400, 'Команда: нужна строка');
  }
  const team = str(req.body.team, { field: 'Команда', max: 120, required: role === 'participant' });
  const members = normalizeMembers(req.body.members, { required: role === 'participant' });

  const id = 'u' + crypto.randomBytes(5).toString('hex');
  const qr = 'MF|' + QR_PREFIX[role] + '|' + id;

  try {
    const passwordHash = await hashPassword(password);
    await db.tx(async (conn) => {
      await conn.query(
        'INSERT INTO users (id, username, password_hash, role, team, qr, created_at) VALUES (?,?,?,?,?,?,?)',
        [id, username, passwordHash, role, team, qr, Date.now()]
      );
      if (members !== undefined) await saveMembers(conn, id, members);
      await saveStation(conn, id, stationId);
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Такой логин уже занят');
    throw err;
  }

  res.status(201).json({ user: { id, username, role, team, qr, stationId, members: members || [], totalPoints: 0 } });
}));

router.post('/:id/credentials.xlsx', requireAuth, requireRole('admin'), ah(async (req, res) => {
  if (req.body.confirm !== true) throw new HttpError(400, 'Подтвердите замену пароля аккаунта.');
  const id = idOf(req.params.id);
  const user = await db.one('SELECT id, username, team, role FROM users WHERE id = ?', [id]);
  if (!user) throw new HttpError(404, 'Пользователь не найден');
  const password = crypto.randomBytes(15).toString('base64url');
  const buffer = buildXlsx({
    sheetName: 'Доступ к аккаунту', columns: [28, 35],
    rows: [
      ['Поле', 'Значение'], ['Логин', user.username], ['Новый пароль', password],
      ['Команда', user.team || ''], ['Роль', ROLE_LABELS[user.role] || user.role],
      ['Адрес входа', 'https://vsnp-moscow.github.io/media-fair/index.html'],
      ['Важно', 'Старый пароль заменён. Передайте файл владельцу аккаунта и храните его в безопасном месте.'],
    ],
  });
  await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(password), id]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="media-fair-access.xlsx"');
  res.setHeader('Cache-Control', 'no-store, private');
  res.send(buffer);
}));

router.patch('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id);
  const target = await db.one(`SELECT u.id, u.username, u.role, u.team, u.qr, vs.task_id AS stationId
      FROM users u LEFT JOIN volunteer_stations vs ON vs.user_id = u.id AND u.role = 'volunteer'
     WHERE u.id = ?`, [id]);
  if (!target) throw new HttpError(404, 'Пользователь не найден');

  const changes = {};

  if (req.body.username !== undefined) {
    changes.username = str(req.body.username, { field: 'Логин', min: 3, max: 32 });
  }
  if (req.body.team !== undefined) {
    if (typeof req.body.team !== 'string') throw new HttpError(400, 'Команда: нужна строка');
    changes.team = str(req.body.team, { field: 'Команда', max: 120, required: false });
  }
  if (req.body.role !== undefined) {
    changes.role = roleOf(req.body.role);
    if (target.role === 'admin' && changes.role !== 'admin' && (await adminCount()) <= 1) {
      throw new HttpError(409, 'Нельзя снять роль с последнего администратора');
    }
  }
  if (req.body.password !== undefined && req.body.password !== '') {
    const password = str(req.body.password, { field: 'Пароль', min: 6, max: 72, trim: false });
    changes.password_hash = await hashPassword(password);
  }

  const nextRole = changes.role || target.role;
  const stationId = stationFor(nextRole, req.body.stationId, target.role !== 'volunteer' && nextRole === 'volunteer');
  const becomingParticipant = target.role !== 'participant' && changes.role === 'participant';
  const members = normalizeMembers(req.body.members, { required: becomingParticipant });
  if ((changes.role || target.role) === 'participant' && (members !== undefined || becomingParticipant)) {
    str(changes.team === undefined ? target.team : changes.team, { field: 'Команда', max: 120 });
  }

  const fields = Object.keys(changes);
  if (fields.length === 0 && members === undefined && stationId === undefined) {
    return res.json({ user: { ...target, members: await readMembers(id) } });
  }

  try {
    await db.tx(async (conn) => {
      const [existing] = await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [id]);
      if (!existing.length) throw new HttpError(404, 'Пользователь не найден');
      if (fields.length > 0) {
        await conn.query(
          `UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
          [...fields.map((f) => changes[f]), id]
        );
      }
      if (members !== undefined) await saveMembers(conn, id, members);
      await saveStation(conn, id, stationId);
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Такой логин уже занят');
    throw err;
  }

  const updated = await db.one(`SELECT u.id, u.username, u.role, u.team, u.qr, vs.task_id AS stationId
      FROM users u LEFT JOIN volunteer_stations vs ON vs.user_id = u.id AND u.role = 'volunteer'
     WHERE u.id = ?`, [id]);
  res.json({ user: { ...updated, members: await readMembers(id), totalPoints: undefined } });
}));

router.delete('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id);
  if (id === req.user.id) throw new HttpError(409, 'Нельзя удалить самого себя');

  const target = await db.one('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'Пользователь не найден');
  if (target.role === 'admin' && (await adminCount()) <= 1) {
    throw new HttpError(409, 'Нельзя удалить последнего администратора');
  }

  await db.query('DELETE FROM users WHERE id = ?', [id]);
  res.json({ ok: true });
}));

/* Поиск участника волонтёром по QR-коду */
router.get('/lookup', requireAuth, requireRole('volunteer', 'admin'), ah(async (req, res) => {
  const qr = str(req.query.qr, { field: 'QR-код', max: 64 });
  const user = await db.one(
    `SELECT u.id, u.username, u.role, u.team, u.qr,
            COALESCE((SELECT SUM(a.points) FROM awards a WHERE a.user_id = u.id), 0) AS total_points
       FROM users u
      WHERE u.qr = ?`,
    [qr]
  );
  if (!user) throw new HttpError(404, 'Участник с таким QR-кодом не найден');
  if (user.role !== 'participant') throw new HttpError(400, 'Этот QR-код принадлежит не участнику');

  res.json({
    user: {
      id: user.id,
      username: user.username,
      team: user.team,
      qr: user.qr,
      totalPoints: Number(user.total_points),
      members: await readMembers(user.id),
    },
  });
}));

module.exports = router;
