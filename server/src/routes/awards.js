'use strict';

const express = require('express');
const db = require('../db');
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
  const userId = idOf(req.body.userId, 'Участник');
  const requestedTaskId = req.body.taskId ? idOf(req.body.taskId, 'Задание') : '';
  const note = str(req.body.note, { field: 'Комментарий', max: 255, required: false });

  try {
    const entry = await db.tx(async (conn) => {
      let taskId = requestedTaskId;
      if (req.user.role === 'volunteer') {
        const [flags] = await conn.query("SELECT v FROM settings WHERE k = 'event_active' FOR SHARE");
        if (flags.length && flags[0].v !== '' && String(flags[0].v) !== '1') {
          throw new HttpError(409, 'Мероприятие остановлено — начисления недоступны.');
        }
        const [volunteers] = await conn.query('SELECT role FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
        if (!volunteers.length || volunteers[0].role !== 'volunteer') {
          throw new HttpError(403, 'Роль пользователя изменилась. Обновите страницу.');
        }
        const [assignments] = await conn.query('SELECT task_id FROM volunteer_stations WHERE user_id = ? FOR UPDATE', [req.user.id]);
        if (!assignments.length) {
          throw new HttpError(409, 'Вам не назначена станция. Обратитесь к администратору.');
        }
        taskId = assignments[0].task_id;
        if (requestedTaskId && requestedTaskId !== taskId) {
          throw new HttpError(403, 'Можно начислять баллы только за назначенную вам станцию.');
        }
      }

      const [users] = await conn.query("SELECT id, username, team FROM users WHERE id = ? AND role = 'participant' FOR UPDATE", [userId]);
      const user = users[0];
      if (!user) throw new HttpError(404, 'Участник не найден');
      const [tasks] = taskId ? await conn.query('SELECT * FROM tasks WHERE id = ? FOR SHARE', [taskId]) : [[]];
      const task = tasks[0] || null;
      if (req.user.role === 'volunteer' && (!task || task.type !== 'station')) {
        throw new HttpError(409, 'Назначенная станция недоступна. Обратитесь к администратору.');
      }
      if (taskId && !task) throw new HttpError(404, 'Задание не найдено');

      let points;
      if (task && task.type === 'station') {
        points = Number(task.points);
      } else if (req.user.role === 'admin' && req.body.points !== undefined) {
        points = intVal(req.body.points, { field: 'Баллы', min: 0, max: 10000, def: 0 });
      } else if (task) {
        points = Number(task.points);
      } else {
        points = await settingNumber('station_points', 50);
      }
      const kind = task ? task.type : 'manual';
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
      return { total: Number(totals[0].total), points, user };
    });

    res.status(201).json({
      ok: true,
      points: entry.points,
      totalPoints: entry.total,
      user: { id: entry.user.id, username: entry.user.username, team: entry.user.team },
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
    totalPoints: await totalFor(req.user.id),
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
    `SELECT u.id, COALESCE(NULLIF(u.team, ''), u.username) AS team,
            GREATEST(COALESCE(m.member_count, 0), 1) AS members,
            COALESCE(p.pts, 0) AS points
       FROM users u
       LEFT JOIN (SELECT user_id, SUM(points) AS pts FROM awards GROUP BY user_id) p
              ON p.user_id = u.id
       LEFT JOIN (SELECT user_id, COUNT(*) AS member_count FROM team_members GROUP BY user_id) m
              ON m.user_id = u.id
      WHERE u.role = 'participant'
      ORDER BY points DESC, team ASC, u.id`
  );

  return rows.map((row, index) => ({
    place: index + 1,
    id: row.id,
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
