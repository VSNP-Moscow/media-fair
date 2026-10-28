'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const db = require('./db');
const { HttpError } = require('./util');

const BCRYPT_ROUNDS = 10;

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, username: user.username, team: user.team },
    config.jwtSecret,
    { expiresIn: config.jwtTtl, issuer: 'media-fair' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    team: user.team || '',
    qr: user.qr,
  };
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'Требуется вход');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { issuer: 'media-fair' });
    } catch {
      throw new HttpError(401, 'Сессия истекла, войдите снова');
    }

    const user = await db.one(
      'SELECT id, username, role, team, qr FROM users WHERE id = ?',
      [payload.sub]
    );
    if (!user) throw new HttpError(401, 'Пользователь не найден');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Требуется вход'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Недостаточно прав'));
    }
    next();
  };
}

module.exports = { hashPassword, checkPassword, signToken, publicUser, requireAuth, requireRole };
