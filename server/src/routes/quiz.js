'use strict';

const express = require('express');
const db = require('../db');
const { ah, intVal } = require('../util');
const { requireAuth, requireRole } = require('../auth');
const { publicQuestions, scoreAnswers, QUIZ_QUESTIONS } = require('../data/quiz');
const { settingNumber } = require('./awards');

const router = express.Router();

router.get('/questions', requireAuth, (req, res) => {
  res.json({ questions: publicQuestions(), total: QUIZ_QUESTIONS.length });
});

/**
 * Первая попытка и каждое улучшение результата дают очки за прирост верных ответов.
 * Максимум за викторину = все вопросы * quiz_points_per_correct, накрутить нельзя.
 */
router.post('/submit', requireAuth, requireRole('participant'), ah(async (req, res) => {
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const { correct, total } = scoreAnswers(answers);
  const perCorrect = await settingNumber('quiz_points_per_correct', 10);
  const task = await db.one("SELECT id, title FROM tasks WHERE type = 'quiz' ORDER BY created_at ASC LIMIT 1");
  const taskId = task ? task.id : '';

  const result = await db.tx(async (conn) => {
    const [bestRows] = await conn.query(
      'SELECT COALESCE(MAX(correct), 0) AS best FROM quiz_attempts WHERE user_id = ?',
      [req.user.id]
    );
    const previousBest = Number(bestRows[0].best);

    await conn.query(
      'INSERT INTO quiz_attempts (user_id, correct, total, created_at) VALUES (?,?,?,?)',
      [req.user.id, correct, total, Date.now()]
    );

    const gainedCorrect = Math.max(0, correct - previousBest);
    const pointsEarned = gainedCorrect * perCorrect;
    const notes = `Викторина: ${correct}/${total} верных`;

    if (pointsEarned > 0) {
      await conn.query(
        `INSERT INTO awards (user_id, task_id, kind, points, awarded_by, note, awarded_at)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE points = points + VALUES(points), note = VALUES(note),
                                 awarded_at = VALUES(awarded_at)`,
        [req.user.id, taskId, 'quiz', pointsEarned, req.user.id, notes, Date.now()]
      );
    }

    const [totals] = await conn.query(
      'SELECT COALESCE(SUM(points), 0) AS total FROM awards WHERE user_id = ?',
      [req.user.id]
    );

    return {
      totalPoints: Number(totals[0].total),
      previousBest,
      earnedPoints: pointsEarned,
    };
  });

  res.json({
    correct,
    total,
    best: Math.max(correct, result.previousBest),
    points: result.earnedPoints,
    totalPoints: result.totalPoints,
    improved: result.earnedPoints > 0,
    maxPoints: total * perCorrect,
  });
}));

module.exports = router;
