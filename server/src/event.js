'use strict';

const db = require('./db');

/**
 * Состояние мероприятия хранится в таблице settings:
 *   event_active      = '1' — участникам доступны QR, карта, викторина и змейка,
 *                            волонтёры могут начислять баллы;
 *   registration_open = '1' — на странице входа доступна самостоятельная регистрация.
 * Флаги читаются из базы на каждом запросе, чтобы переключение в панели
 * администратора срабатывало сразу на всех устройствах.
 */

const KEY_ACTIVE = 'event_active';
const KEY_REGISTER = 'registration_open';

function flag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value) === '1';
}

async function readFlags() {
  const rows = await db.query('SELECT k, v FROM settings WHERE k IN (?, ?)', [KEY_ACTIVE, KEY_REGISTER]);
  const raw = {};
  rows.forEach((row) => { raw[row.k] = row.v; });
  return {
    active: flag(raw[KEY_ACTIVE], true),
    registrationOpen: flag(raw[KEY_REGISTER], true),
  };
}

async function setFlag(key, value) {
  await db.query(
    'INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [key, value ? '1' : '0']
  );
}

async function isActive() {
  return (await readFlags()).active;
}

async function isRegistrationOpen() {
  return (await readFlags()).registrationOpen;
}

module.exports = { readFlags, setFlag, isActive, isRegistrationOpen, KEY_ACTIVE, KEY_REGISTER };
