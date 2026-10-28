'use strict';

const express = require('express');
const db = require('../db');
const { ah, intVal } = require('../util');
const { requireAuth, requireRole } = require('../auth');
const { settingNumber } = require('./awards');

const router = express.Router();

/**
 * Очки за змейку начисляются только за улучшение личного рекорда,
 * поэтому повторные нажатия «Сохранить» не добавляют баллы.
 */
router.post('/snake', requireAuth, requireRole('participant'), ah(async (req, res) => {
  const score = intVal(req.body.score, { field: 'Очки', min: 0, max: 5000, def: 0 });
  const perScore = await settingNumber('snake_points_per_score', 1);
  const task = await db.one("SELECT id FROM tasks WHERE type = 'game' ORDER BY created_at ASC LIMIT 1");
  const taskId = task ? task.id : '';
  const normalized = Math.max(0, Math.floor(score * perScore));

  const result = await db.tx(async (conn) => {
    const [rows] = await conn.query(
      'SELECT best, task_id FROM game_best WHERE user_id = ? FOR UPDATE',
      [req.user.id]
    );
    const previousBest = rows.length ? Number(rows[0].best) : 0;

    if (score <= previousBest) {
      const [totalRows] = await conn.query(
        'SELECT COALESCE(SUM(points), 0) AS total FROM awards WHERE user_id = ?',
        [req.user.id]
      );
      return {
        best: previousBest,
        improved: false,
        points: 0,
        totalPoints: Number(totalRows[0].total),
      };
    }

    await conn.query(
      `INSERT INTO game_best (user_id, task_id, best, updated_at) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE best = VALUES(best), task_id = VALUES(task_id), updated_at = VALUES(updated_at)`,
      [req.user.id, taskId, score, Date.now()]
    );

    const previousPoints = Math.floor(previousBest * perScore);
    const gained = Math.max(0, normalized - previousPoints);

    await conn.query(
      `INSERT INTO awards (user_id, task_id, kind, points, awarded_by, note, awarded_at)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE points = points + VALUES(points), note = VALUES(note),
                               awarded_at = VALUES(awarded_at)`,
      [req.user.id, taskId, 'game', gained, req.user.id, `Змейка: рекорд ${score}`, Date.now()]
    );

    const [totalRows] = await conn.query(
      'SELECT COALESCE(SUM(points), 0) AS total FROM awards WHERE user_id = ?',
      [req.user.id]
    );

    return {
      best: score,
      improved: true,
      points: gained,
      totalPoints: Number(totalRows[0].total),
    };
  });

  res.json(result);
}));

module.exports = router;
