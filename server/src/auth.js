'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const db = require('./db');
const { HttpError } = require('./util');
const { readMembers } = require('./team');

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
    stationId: user.stationId || null,
    members: user.members || [],
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
      `SELECT u.id, u.username, u.role, u.team, u.qr, vs.task_id AS stationId
         FROM users u LEFT JOIN volunteer_stations vs ON vs.user_id = u.id AND u.role = 'volunteer'
        WHERE u.id = ?`,
      [payload.sub]
    );
    if (!user) throw new HttpError(401, 'Пользователь не найден');

    user.members = await readMembers(user.id);
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
