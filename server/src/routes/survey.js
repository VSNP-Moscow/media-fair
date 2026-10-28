'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const events = require('../event');
const { HttpError, ah, str, idOf } = require('../util');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

/** JSON-колонки mysql2 отдаёт уже разобранными, но на всякий случай поддерживаем строку. */
function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return [];
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      return {};
    }
  }
  return {};
}

function normalizeOptions(input) {
  if (!Array.isArray(input)) {
    throw new HttpError(400, 'Варианты ответа: нужен список');
  }

  const options = input.map((item) => String(item === undefined || item === null ? '' : item).trim()).filter(Boolean);
  if (options.length < MIN_OPTIONS) throw new HttpError(400, 'Нужно минимум ' + MIN_OPTIONS + ' варианта ответа');
  if (options.length > MAX_OPTIONS) throw new HttpError(400, 'Максимум ' + MAX_OPTIONS + ' вариантов ответа');
  options.forEach((option) => {
    if (option.length > 200) throw new HttpError(400, 'Вариант ответа: максимум 200 символов');
  });

  return options;
}

async function readQuestions() {
  const rows = await db.query('SELECT id, text, options FROM survey_questions ORDER BY position, created_at');
  return rows.map((row) => ({ id: row.id, text: row.text, options: parseArray(row.options) }));
}

function publicQuestions(questions) {
  return questions.map((question) => ({ id: question.id, text: question.text, options: question.options }));
}

/* ---------- вопросы: чтение (любая авторизованная роль) ---------- */
router.get('/', requireAuth, ah(async (req, res) => {
  const questions = await readQuestions();
  const response = await db.one(
    'SELECT answers, submitted_at FROM survey_responses WHERE user_id = ?',
    [req.user.id]
  );

  res.json({
    questions: publicQuestions(questions),
    submitted: !!response,
    answeredAt: response ? Number(response.submitted_at) : null,
    answers: response ? parseObject(response.answers) : null,
  });
}));

/* ---------- отправка ответов участником ---------- */
router.post('/submit', requireAuth, requireRole('participant'), ah(async (req, res) => {
  if (!(await events.isActive())) {
    throw new HttpError(409, 'Мероприятие остановлено — опросник недоступен.');
  }

  const questions = await readQuestions();
  if (questions.length === 0) throw new HttpError(409, 'Опросник пока не готов.');

  const raw = req.body.answers;
  if (!Array.isArray(raw) || raw.length !== questions.length) {
    throw new HttpError(400, 'Ответьте на все вопросы опросника');
  }

  const answers = {};
  raw.forEach((value, index) => {
    const question = questions[index];
    const choice = Number(value);
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
      throw new HttpError(400, 'Некорректный ответ на вопрос ' + (index + 1));
    }
    answers[question.id] = choice;
  });

  try {
    await db.query(
      'INSERT INTO survey_responses (user_id, answers, submitted_at) VALUES (?,?,?)',
      [req.user.id, JSON.stringify(answers), Date.now()]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Вы уже отправили ответы на опросник.');
    throw err;
  }

  res.status(201).json({ ok: true, answers });
}));

/* ---------- конструктор: сводка ответов ---------- */
router.get('/results', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const questions = await readQuestions();
  const responses = await db.query('SELECT user_id, answers FROM survey_responses');
  const total = await db.one("SELECT COUNT(*) AS total FROM users WHERE role = 'participant'");

  const maps = responses.map((row) => parseObject(row.answers));

  const stats = questions.map((question) => {
    const counts = question.options.map(() => 0);
    maps.forEach((answers) => {
      const choice = answers[question.id];
      if (Number.isInteger(choice) && counts[choice] !== undefined) counts[choice] += 1;
    });
    return {
      id: question.id,
      text: question.text,
      options: question.options,
      counts,
      answered: counts.reduce((sum, value) => sum + value, 0),
    };
  });

  res.json({
    totalParticipants: Number(total.total),
    responses: responses.length,
    questions: stats,
  });
}));

/* ---------- конструктор: создание вопроса ---------- */
router.post('/questions', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const text = str(req.body.text, { field: 'Вопрос', min: 3, max: 500 });
  const options = normalizeOptions(req.body.options);

  const row = await db.one('SELECT COALESCE(MAX(position), 0) AS max_position FROM survey_questions');
  const id = 'q' + crypto.randomBytes(5).toString('hex');

  await db.query(
    'INSERT INTO survey_questions (id, text, options, position, created_at) VALUES (?,?,?,?,?)',
    [id, text, JSON.stringify(options), Number(row.max_position) + 1, Date.now()]
  );

  res.status(201).json({ question: { id, text, options } });
}));

/* ---------- конструктор: изменение вопроса ---------- */
router.patch('/questions/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id, 'Вопрос');
  const current = await db.one('SELECT id, text, options FROM survey_questions WHERE id = ?', [id]);
  if (!current) throw new HttpError(404, 'Вопрос не найден');

  const text = req.body.text === undefined
    ? current.text
    : str(req.body.text, { field: 'Вопрос', min: 3, max: 500 });
  const options = req.body.options === undefined
    ? parseArray(current.options)
    : normalizeOptions(req.body.options);

  await db.query('UPDATE survey_questions SET text = ?, options = ? WHERE id = ?', [text, JSON.stringify(options), id]);

  res.json({ question: { id, text, options } });
}));

/* ---------- конструктор: удаление вопроса ---------- */
router.delete('/questions/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id, 'Вопрос');
  const current = await db.one('SELECT id FROM survey_questions WHERE id = ?', [id]);
  if (!current) throw new HttpError(404, 'Вопрос не найден');

  await db.query('DELETE FROM survey_questions WHERE id = ?', [id]);
  res.json({ ok: true });
}));

module.exports = router;
