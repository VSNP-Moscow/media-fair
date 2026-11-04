'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { HttpError, ah, intVal, idOf } = require('../util');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

const MAX_IMAGES = 6;
const MAX_FLOOR = 3;
const MAX_BYTES = 4 * 1024 * 1024;

function toImage(row) {
  return {
    id: row.id,
    floor: Number(row.floor),
    position: Number(row.position),
    mime: row.mime,
    size: Number(row.size),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function parseDataUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_BYTES * 1.4) {
    throw new HttpError(400, 'Изображение слишком большое. Максимум 4 МБ.');
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
  if (!match) throw new HttpError(400, 'Нужно изображение JPG, PNG или WebP.');

  const declared = match[1];
  const data = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (data.length === 0 || data.length > MAX_BYTES) {
    throw new HttpError(400, 'Изображение слишком большое. Максимум 4 МБ.');
  }

  let actual = null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) actual = 'image/jpeg';
  else if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) actual = 'image/png';
  else if (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') actual = 'image/webp';

  if (!actual) throw new HttpError(400, 'Файл не похож на изображение JPG, PNG или WebP.');
  if (actual !== declared) throw new HttpError(400, 'Тип файла не совпадает с содержимым.');

  return { mime: actual, data };
}

function floorOf(value) {
  return intVal(value, { field: 'Этаж', min: 1, max: MAX_FLOOR });
}

/* ---------- просмотр: любая авторизованная роль ---------- */
router.get('/', requireAuth, ah(async (req, res) => {
  const rows = await db.query(
    `SELECT id, floor, position, mime, size, created_at, updated_at
       FROM map_images ORDER BY floor ASC, position ASC, created_at ASC`
  );
  res.json({ images: rows.map(toImage), maxImages: MAX_IMAGES, maxFloor: MAX_FLOOR });
}));

router.get('/images/:id', requireAuth, ah(async (req, res) => {
  const id = idOf(req.params.id);
  const row = await db.one('SELECT id, floor, mime, data, size, updated_at FROM map_images WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'Изображение карты не найдено');

  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[row.mime] || 'img';
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Content-Length', String(row.size));
  res.setHeader('Content-Disposition', `inline; filename="map-floor-${Number(row.floor)}-${id}.${extension}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(row.data);
}));

/* ---------- управление: только администратор ---------- */
router.post('/', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const floor = floorOf(req.body.floor);
  const { mime, data } = parseDataUrl(req.body.image);

  const id = 'm' + crypto.randomBytes(6).toString('hex');
  const now = Date.now();

  await db.tx(async (conn) => {
    const [countRows] = await conn.query('SELECT COUNT(*) AS total FROM map_images FOR UPDATE');
    if (Number(countRows[0].total) >= MAX_IMAGES) {
      throw new HttpError(409, `Можно добавить не больше ${MAX_IMAGES} изображений карты.`);
    }
    const [positionRows] = await conn.query(
      'SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM map_images WHERE floor = ? FOR UPDATE',
      [floor]
    );
    await conn.query(
      `INSERT INTO map_images (id, floor, position, mime, data, size, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, floor, Number(positionRows[0].next_position), mime, data, data.length, now, now]
    );
  });

  const row = await db.one(
    'SELECT id, floor, position, mime, size, created_at, updated_at FROM map_images WHERE id = ?',
    [id]
  );
  res.status(201).json({ image: toImage(row) });
}));

router.patch('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id);
  const floor = floorOf(req.body.floor);

  await db.tx(async (conn) => {
    const [rows] = await conn.query('SELECT id, floor FROM map_images WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new HttpError(404, 'Изображение карты не найдено');
    if (Number(rows[0].floor) === floor) return;

    const [positionRows] = await conn.query(
      'SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM map_images WHERE floor = ? FOR UPDATE',
      [floor]
    );
    await conn.query('UPDATE map_images SET floor = ?, position = ?, updated_at = ? WHERE id = ?',
      [floor, Number(positionRows[0].next_position), Date.now(), id]);
  });

  const row = await db.one(
    'SELECT id, floor, position, mime, size, created_at, updated_at FROM map_images WHERE id = ?',
    [id]
  );
  res.json({ image: toImage(row) });
}));

router.delete('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id);
  const existing = await db.one('SELECT id FROM map_images WHERE id = ?', [id]);
  if (!existing) throw new HttpError(404, 'Изображение карты не найдено');
  await db.query('DELETE FROM map_images WHERE id = ?', [id]);
  res.json({ ok: true });
}));

module.exports = router;
