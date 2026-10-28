'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const events = require('../event');
const { HttpError, ah, str, roleOf } = require('../util');
const { hashPassword, checkPassword, signToken, publicUser, requireAuth } = require('../auth');

const router = express.Router();

/* --- ограничение попыток входа (в памяти процесса) --- */
const attempts = new Map();

function clientKey(req) {
  return (req.ip || req.socket.remoteAddress || 'unknown').toString();
}

function checkRateLimit(req) {
  const key = clientKey(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + config.loginWindowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > config.loginMaxAttempts) {
    const minutes = Math.max(1, Math.round((entry.resetAt - now) / 60000));
    throw new HttpError(429, `Слишком много попыток входа. Повторите через ${minutes} мин.`);
  }
}

function resetRateLimit(req) {
  attempts.delete(clientKey(req));
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (entry.resetAt < now) attempts.delete(key);
  }
}, 60000).unref();

/* --- первый администратор --- */
router.get('/bootstrap-status', ah(async (req, res) => {
  const row = await db.one('SELECT COUNT(*) AS total FROM users');
  res.json({ needsAdmin: Number(row.total) === 0 });
}));

router.post('/bootstrap', async (req, res, next) => {
  try {
    const username = str(req.body.username, { field: 'Логин', min: 3, max: 32 });
    const password = str(req.body.password, { field: 'Пароль', min: 6, max: 72, trim: false });
    const team = str(req.body.team, { field: 'Команда', max: 120, required: false });

    const created = await db.tx(async (conn) => {
      const [rows] = await conn.query('SELECT COUNT(*) AS total FROM users FOR UPDATE');
      if (Number(rows[0].total) > 0) {
        throw new HttpError(409, 'Пользователи уже существуют. Войдите под администратором.');
      }
      const id = 'u' + crypto.randomBytes(5).toString('hex');
      await conn.query(
        'INSERT INTO users (id, username, password_hash, role, team, qr, created_at) VALUES (?,?,?,?,?,?,?)',
        [id, username, await hashPassword(password), 'admin', team, 'MF|ADMIN|' + id, Date.now()]
      );
      return { id, username, role: 'admin', team, qr: 'MF|ADMIN|' + id };
    });

    res.status(201).json({ user: publicUser(created), token: signToken(created) });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return next(new HttpError(409, 'Такой логин уже занят'));
    }
    next(err);
  }
});

/* --- самостоятельная регистрация участника --- */
router.post('/register', async (req, res, next) => {
  try {
    checkRateLimit(req);

    if (!(await events.isRegistrationOpen())) {
      throw new HttpError(403, 'Регистрация закрыта. Обратитесь к организаторам.');
    }

    const username = str(req.body.username, { field: 'Логин', min: 3, max: 32 });
    const password = str(req.body.password, { field: 'Пароль', min: 6, max: 72, trim: false });
    const team = str(req.body.team, { field: 'Команда', max: 120, required: false });

    const id = 'u' + crypto.randomBytes(5).toString('hex');
    const qr = 'MF|PART|' + id;

    try {
      await db.query(
        'INSERT INTO users (id, username, password_hash, role, team, qr, created_at) VALUES (?,?,?,?,?,?,?)',
        [id, username, await hashPassword(password), 'participant', team, qr, Date.now()]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Такой логин уже занят. Выберите другой.');
      throw err;
    }

    resetRateLimit(req);
    const user = { id, username, role: 'participant', team, qr };
    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    next(err);
  }
});

/* --- вход --- */
router.post('/login', async (req, res, next) => {
  try {
    checkRateLimit(req);

    let username;
    let password;
    try {
      username = str(req.body.username, { field: 'Логин', max: 64 });
      password = str(req.body.password, { field: 'Пароль', min: 1, max: 72, trim: false });
    } catch (err) {
      err.status = 400;
      throw err;
    }

    const user = await db.one(
      'SELECT id, username, password_hash, role, team, qr FROM users WHERE username = ?',
      [username]
    );
    // Одинаковый ответ для «нет пользователя» и «неверный пароль».
    if (!user || !(await checkPassword(password, user.password_hash))) {
      throw new HttpError(401, 'Неверный логин или пароль');
    }

    resetRateLimit(req);
    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
