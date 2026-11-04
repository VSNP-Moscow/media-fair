'use strict';

const db = require('./db');

const KEY_ACTIVE = 'event_active';
const KEY_REGISTER = 'registration_open';
const KEY_SURVEY = 'survey_open';

function flag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value) === '1';
}

async function readFlags() {
  const rows = await db.query('SELECT k, v FROM settings WHERE k IN (?, ?, ?)', [KEY_ACTIVE, KEY_REGISTER, KEY_SURVEY]);
  const raw = {};
  rows.forEach((row) => { raw[row.k] = row.v; });
  return {
    active: flag(raw[KEY_ACTIVE], true),
    registrationOpen: flag(raw[KEY_REGISTER], true),
    surveyOpen: flag(raw[KEY_SURVEY], false),
  };
}

async function setFlag(key, value) {
  await db.query(
    'INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [key, value ? '1' : '0']
  );
}

async function isActive() { return (await readFlags()).active; }
async function isRegistrationOpen() { return (await readFlags()).registrationOpen; }
async function isSurveyOpen() { return (await readFlags()).surveyOpen; }

module.exports = { readFlags, setFlag, isActive, isRegistrationOpen, isSurveyOpen, KEY_ACTIVE, KEY_REGISTER, KEY_SURVEY };
