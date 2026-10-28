'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { HttpError, ah, str, roleOf, idOf } = require('../util');
const { hashPassword, requireAuth, requireRole } = require('../auth');

const router = express.Router();

const QR_PREFIX = { admin: 'ADMIN', participant: 'PART', volunteer: 'VOL' };

async function adminCount() {
  const row = await db.one("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
  return Number(row.total);
}

function listSql() {
  return `
    SELECT u.id, u.username, u.role, u.team, u.qr, u.created_at,
           COALESCE(p.pts, 0) AS total_points
      FROM users u
      LEFT JOIN (SELECT user_id, SUM(points) AS pts FROM awards GROUP BY user_id) p
             ON p.user_id = u.id
     ORDER BY FIELD(u.role, 'admin', 'volunteer', 'participant'), u.username`;
}

router.get('/', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const users = await db.query(listSql());
  res.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      team: u.team,
      qr: u.qr,
      totalPoints: Number(u.total_points),
      createdAt: Number(u.created_at),
    })),
  });
}));

router.post('/', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const username = str(req.body.username, { field: 'Логин', min: 3, max: 32 });
  const password = str(req.body.password, { field: 'Пароль', min: 6, max: 72, trim: false });
  const role = roleOf(req.body.role);
  const team = str(req.body.team, { field: 'Команда', max: 120, required: false });

  const id = 'u' + crypto.randomBytes(5).toString('hex');
  const qr = 'MF|' + QR_PREFIX[role] + '|' + id;

  try {
    await db.query(
      'INSERT INTO users (id, username, password_hash, role, team, qr, created_at) VALUES (?,?,?,?,?,?,?)',
      [id, username, await hashPassword(password), role, team, qr, Date.now()]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Такой логин уже занят');
    throw err;
  }

  res.status(201).json({ user: { id, username, role, team, qr, totalPoints: 0 } });
}));

router.patch('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id);
  const target = await db.one('SELECT id, username, role, team FROM users WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'Пользователь не найден');

  const changes = {};

  if (req.body.username !== undefined) {
    changes.username = str(req.body.username, { field: 'Логин', min: 3, max: 32 });
  }
  if (req.body.team !== undefined) {
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

  const fields = Object.keys(changes);
  if (fields.length === 0) return res.json({ user: { ...target } });

  try {
    await db.query(
      `UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map((f) => changes[f]), id]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Такой логин уже занят');
    throw err;
  }

  const updated = await db.one('SELECT id, username, role, team, qr FROM users WHERE id = ?', [id]);
  res.json({ user: { ...updated, totalPoints: undefined } });
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
    },
  });
}));

module.exports = router;
