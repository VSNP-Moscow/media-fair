'use strict';

const express = require('express');
const db = require('../db');
const events = require('../event');
const { HttpError, ah, str, intVal, idOf } = require('../util');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

async function settingNumber(key, fallback) {  const row = await db.one('SELECT v FROM settings WHERE k = ?', [key]);
  const n = Number(row ? row.v : fallback);
  return Number.isFinite(n) ? n : fallback;
}

async function totalFor(userId, conn = db) {
  const rows = await conn.query(
    'SELECT COALESCE(SUM(points), 0) AS total FROM awards WHERE user_id = ?',
    [userId]
  );
  return Number(rows[0].total);
}

/* ---------- начисление (волонтёр, админ) ---------- */
router.post('/', requireAuth, requireRole('volunteer', 'admin'), ah(async (req, res) => {
  // Во время остановки начисления закрыты для волонтёров;
  // администратор может исправить очки вручную в любой момент.
  if (req.user.role !== 'admin' && !(await events.isActive())) {
    throw new HttpError(409, 'Мероприятие остановлено — начисления недоступны.');
  }

  const userId = idOf(req.body.userId, 'Участник');
  const taskId = req.body.taskId ? idOf(req.body.taskId, 'Задание') : '';
  const note = str(req.body.note, { field: 'Комментарий', max: 255, required: false });

  const user = await db.one("SELECT id, username, team FROM users WHERE id = ? AND role = 'participant'", [userId]);
  if (!user) throw new HttpError(404, 'Участник не найден');

  const task = taskId ? await db.one('SELECT * FROM tasks WHERE id = ?', [taskId]) : null;
  if (taskId && !task) throw new HttpError(404, 'Задание не найдено');

  let points;
  if (task && task.type === 'station') {
    // Очки за станцию задаёт администратор в задании, а не волонтёр.
    points = Number(task.points);
  } else if (req.user.role === 'admin' && req.body.points !== undefined) {
    points = intVal(req.body.points, { field: 'Баллы', min: 0, max: 10000, def: 0 });
  } else if (task) {
    points = Number(task.points);
  } else {
    points = await settingNumber('station_points', 50);
  }

  const kind = task ? task.type : 'manual';

  try {
    const entry = await db.tx(async (conn) => {
      const [dup] = await conn.query(
        'SELECT id, points FROM awards WHERE user_id = ? AND task_id = ?',
        [userId, taskId]
      );
      // Повторное начисление за то же задание запрещено для станций и в целом.
      if (dup.length > 0) {
        throw new HttpError(409, `Этому участнику уже начислено за «${task ? task.title : note || 'задание'}»`);
      }

      await conn.query(
        `INSERT INTO awards (user_id, task_id, kind, points, awarded_by, note, awarded_at)
         VALUES (?,?,?,?,?,?,?)`,
        [userId, taskId, kind, points, req.user.id, note || (task ? task.title : 'Начисление'), Date.now()]
      );

      const [totals] = await conn.query(
        'SELECT COALESCE(SUM(points), 0) AS total FROM awards WHERE user_id = ?',
        [userId]
      );
      return { total: Number(totals[0].total) };
    });

    res.status(201).json({
      ok: true,
      points,
      totalPoints: entry.total,
      user: { id: user.id, username: user.username, team: user.team },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Этому участнику уже начислено за это задание');
    }
    throw err;
  }
}));

/* ---------- очки участника ---------- */
router.get('/mine', requireAuth, ah(async (req, res) => {
  const rows = await db.query(
    `SELECT a.id, a.points, a.note, a.awarded_at, a.kind,
            COALESCE(t.title, '') AS task_title
       FROM awards a
       LEFT JOIN tasks t ON t.id = a.task_id
      WHERE a.user_id = ?
      ORDER BY a.awarded_at DESC
      LIMIT 100`,
    [req.user.id]
  );

  res.json({
    totalPoints: rows.reduce((sum, row) => sum + Number(row.points), 0),
    entries: rows.map((row) => ({
      id: Number(row.id),
      points: Number(row.points),
      note: row.note || row.task_title || 'Начисление',
      kind: row.kind,
      awardedAt: Number(row.awarded_at),
    })),
  });
}));

/* ---------- последние начисления (волонтёр, админ) ---------- */
router.get('/recent', requireAuth, requireRole('volunteer', 'admin'), ah(async (req, res) => {
  const rows = await db.query(
    `SELECT a.id, a.points, a.note, a.awarded_at, a.kind,
            u.username, u.team,
            COALESCE(t.title, '') AS task_title
       FROM awards a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN tasks t ON t.id = a.task_id
      ORDER BY a.awarded_at DESC
      LIMIT 20`
  );

  res.json({
    entries: rows.map((row) => ({
      id: Number(row.id),
      username: row.username,
      team: row.team || '',
      points: Number(row.points),
      note: row.task_title || row.note || '—',
      kind: row.kind,
      awardedAt: Number(row.awarded_at),
    })),
  });
}));

/* ---------- табло команд (публичное) ---------- */
async function leaderboard() {
  const rows = await db.query(
    `SELECT u.team AS team,
            COUNT(*) AS members,
            COALESCE(SUM(p.pts), 0) AS points
       FROM users u
       LEFT JOIN (SELECT user_id, SUM(points) AS pts FROM awards GROUP BY user_id) p
              ON p.user_id = u.id
      WHERE u.role = 'participant'
      GROUP BY u.team
      ORDER BY points DESC, u.team ASC`
  );

  return rows.map((row, index) => ({
    place: index + 1,
    team: row.team || 'Без команды',
    members: Number(row.members),
    points: Number(row.points),
  }));
}

async function summary() {
  const row = await db.one(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'participant') AS participants,
            (SELECT COUNT(*) FROM awards) AS awards,
            (SELECT COALESCE(SUM(points), 0) FROM awards) AS points`
  );
  return {
    participants: Number(row.participants),
    awards: Number(row.awards),
    points: Number(row.points),
  };
}

router.get('/leaderboard', ah(async (req, res) => {
  res.json({ teams: await leaderboard() });
}));

router.get('/dashboard', ah(async (req, res) => {
  const [teams, totals] = await Promise.all([leaderboard(), summary()]);
  res.json({ teams, totals, updatedAt: Date.now() });
}));

module.exports = router;
module.exports.totalFor = totalFor;
module.exports.settingNumber = settingNumber;
