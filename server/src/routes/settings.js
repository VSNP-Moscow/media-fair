'use strict';

const express = require('express');
const db = require('../db');
const { ah, intVal } = require('../util');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

const NUMERIC_KEYS = {
  quiz_points_per_correct: { field: 'Очки за верный ответ', min: 0, max: 1000 },
  snake_points_per_score: { field: 'Очки за очко в змейке', min: 0, max: 100 },
  station_points: { field: 'Очки за станцию по умолчанию', min: 0, max: 1000 },
};

async function readSettings() {
  const rows = await db.query('SELECT k, v FROM settings');
  const result = {};
  rows.forEach((row) => { result[row.k] = row.v; });
  return result;
}

router.get('/', requireAuth, ah(async (req, res) => {
  const raw = await readSettings();
  const settings = {};
  Object.keys(NUMERIC_KEYS).forEach((key) => {
    settings[key] = Number(raw[key] || 0);
  });
  res.json({ settings });
}));

router.put('/', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const updates = {};
  Object.entries(NUMERIC_KEYS).forEach(([key, meta]) => {
    if (req.body[key] !== undefined) {
      updates[key] = intVal(req.body[key], { field: meta.field, min: meta.min, max: meta.max });
    }
  });

  for (const [key, value] of Object.entries(updates)) {
    await db.query(
      'INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
      [key, String(value)]
    );
  }

  const raw = await readSettings();
  const settings = {};
  Object.keys(NUMERIC_KEYS).forEach((key) => {
    settings[key] = Number(raw[key] || 0);
  });
  res.json({ settings });
}));

module.exports = router;
module.exports.readSettings = readSettings;
