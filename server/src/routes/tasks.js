'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { HttpError, ah, str, intVal, num, typeOf, idOf } = require('../util');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    type: row.type,
    points: Number(row.points),
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    createdAt: Number(row.created_at),
  };
}

router.get('/', requireAuth, ah(async (req, res) => {
  const rows = await db.query('SELECT * FROM tasks ORDER BY created_at ASC');
  res.json({ tasks: rows.map(toTask) });
}));

router.post('/', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const title = str(req.body.title, { field: 'Название', max: 160 });
  const description = str(req.body.description, { field: 'Описание', max: 2000, required: false });
  const type = typeOf(req.body.type);
  const points = intVal(req.body.points, { field: 'Очки', min: 0, max: 10000, def: 0 });
  const lat = num(req.body.lat, { field: 'Широта', min: -90, max: 90, def: null });
  const lng = num(req.body.lng, { field: 'Долгота', min: -180, max: 180, def: null });

  const id = 't' + crypto.randomBytes(5).toString('hex');
  await db.query(
    `INSERT INTO tasks (id, title, description, type, points, lat, lng, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, title, description, type, points, lat, lng, req.user.id, Date.now()]
  );

  const row = await db.one('SELECT * FROM tasks WHERE id = ?', [id]);
  res.status(201).json({ task: toTask(row) });
}));

router.patch('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id);
  const existing = await db.one('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!existing) throw new HttpError(404, 'Задание не найдено');

  const sets = [];
  const params = [];

  if (req.body.title !== undefined) {
    sets.push('title = ?');
    params.push(str(req.body.title, { field: 'Название', max: 160 }));
  }
  if (req.body.description !== undefined) {
    sets.push('description = ?');
    params.push(str(req.body.description, { field: 'Описание', max: 2000, required: false }));
  }
  if (req.body.type !== undefined) {
    sets.push('type = ?');
    params.push(typeOf(req.body.type));
  }
  if (req.body.points !== undefined) {
    sets.push('points = ?');
    params.push(intVal(req.body.points, { field: 'Очки', min: 0, max: 10000 }));
  }
  if (req.body.lat !== undefined) {
    sets.push('lat = ?');
    params.push(num(req.body.lat, { field: 'Широта', min: -90, max: 90, def: null }));
  }
  if (req.body.lng !== undefined) {
    sets.push('lng = ?');
    params.push(num(req.body.lng, { field: 'Долгота', min: -180, max: 180, def: null }));
  }

  if (sets.length === 0) return res.json({ task: toTask(existing) });

  params.push(id);
  await db.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);

  const row = await db.one('SELECT * FROM tasks WHERE id = ?', [id]);
  res.json({ task: toTask(row) });
}));

router.delete('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id);
  const existing = await db.one('SELECT id FROM tasks WHERE id = ?', [id]);
  if (!existing) throw new HttpError(404, 'Задание не найдено');

  await db.tx(async (conn) => {
    // Начисления сохраняем: в note уже лежит название задания.
    await conn.query('DELETE FROM tasks WHERE id = ?', [id]);
  });

  res.json({ ok: true });
}));

module.exports = router;
