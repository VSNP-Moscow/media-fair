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

function questionDefinition(body, current) {
  const type = body.type === undefined ? (current ? current.type : 'choice') : body.type;
  if (!['text', 'choice', 'multiple'].includes(type)) throw new HttpError(400, 'Неизвестный тип вопроса');
  const options = type === 'text' ? [] : normalizeOptions(body.options === undefined ? current && current.options : body.options);
  return { type, options };
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

function readQuestion(row) {
  const options = parseArray(row.options);
  return { id: row.id, text: row.text, options, type: row.type || (options.length ? 'choice' : 'text') };
}

async function readQuestions() {
  const rows = await db.query(`SELECT q.id, q.text, q.options, t.type FROM survey_questions q
    LEFT JOIN survey_question_types t ON t.question_id = q.id ORDER BY q.position, q.created_at`);
  return rows.map(readQuestion);
}

function publicQuestions(questions) {
  return questions.map((question) => ({ id: question.id, text: question.text, options: question.options, type: question.type }));
}

/* ---------- вопросы: чтение (любая авторизованная роль) ---------- */
router.get('/', requireAuth, ah(async (req, res) => {
  const questions = await readQuestions();
  const response = await db.one(
    'SELECT answers, submitted_at FROM survey_responses WHERE user_id = ?',
    [req.user.id]
  );

  const saved = response ? parseObject(response.answers) : {};
  const pending = questions.filter((question) => !Object.prototype.hasOwnProperty.call(saved, question.id));
  res.json({
    questions: publicQuestions(pending.length ? pending : questions),
    open: await events.isSurveyOpen(),
    submitted: questions.length > 0 && pending.length === 0,
    answeredAt: response ? Number(response.submitted_at) : null,
    answers: response ? parseObject(response.answers) : null,
  });
}));

/* ---------- отправка ответов участником ---------- */
router.post('/submit', requireAuth, requireRole('participant'), ah(async (req, res) => {
  if (!(await events.isSurveyOpen())) {
    throw new HttpError(409, 'Опросник закрыт организаторами.');
  }

  const allQuestions = await readQuestions();
  const previous = await db.one('SELECT answers FROM survey_responses WHERE user_id = ?', [req.user.id]);
  const saved = previous ? parseObject(previous.answers) : {};
  const questions = allQuestions.filter((question) => !Object.prototype.hasOwnProperty.call(saved, question.id));
  if (allQuestions.length === 0) throw new HttpError(409, 'Опросник пока не готов.');
  if (questions.length === 0) throw new HttpError(409, 'Вы уже ответили на все текущие вопросы.');

  const raw = req.body.answers;
  if (!Array.isArray(raw) || raw.length !== questions.length) {
    throw new HttpError(400, 'Ответьте на все вопросы опросника');
  }

  const answers = {};
  raw.forEach((value, index) => {
    const question = questions[index];
    if (question.type === 'text') {
      if (typeof value !== 'string') throw new HttpError(400, 'Вопрос ' + (index + 1) + ': введите текст');
      answers[question.id] = str(value, { field: 'Ответ на вопрос ' + (index + 1), max: 2000 });
      return;
    }
    if (question.type === 'multiple') {
      if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length ||
          value.some((choice) => !Number.isInteger(choice) || choice < 0 || choice >= question.options.length)) {
        throw new HttpError(400, 'Вопрос ' + (index + 1) + ': выберите один или несколько разных вариантов');
      }
      answers[question.id] = value;
      return;
    }
    const choice = value;
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
      throw new HttpError(400, 'Некорректный ответ на вопрос ' + (index + 1));
    }
    answers[question.id] = choice;
  });

  await db.tx(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const [rows] = await conn.query('SELECT answers FROM survey_responses WHERE user_id = ? FOR UPDATE', [req.user.id]);
    const current = rows.length ? parseObject(rows[0].answers) : {};
    if (Object.keys(answers).some((id) => Object.prototype.hasOwnProperty.call(current, id))) {
      throw new HttpError(409, 'Эти ответы уже сохранены. Обновите опросник.');
    }
    await conn.query(
      `INSERT INTO survey_responses (user_id, answers, submitted_at) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE answers = VALUES(answers), submitted_at = VALUES(submitted_at)`,
      [req.user.id, JSON.stringify({ ...current, ...answers }), Date.now()]
    );
  });

  res.status(201).json({ ok: true, answers });
}));

/* ---------- конструктор: сводка ответов ---------- */
router.get('/results', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const questions = await readQuestions();
  const responses = await db.query(`SELECT r.user_id, r.answers, r.submitted_at, u.username, u.team
    FROM survey_responses r JOIN users u ON u.id = r.user_id ORDER BY r.submitted_at DESC`);
  const total = await db.one("SELECT COUNT(*) AS total FROM users WHERE role = 'participant'");

  const maps = responses.map((row) => parseObject(row.answers));

  const stats = questions.map((question) => {
    if (question.type === 'text') {
      const textAnswers = responses.flatMap((row) => {
        const text = parseObject(row.answers)[question.id];
        return typeof text === 'string' && text.trim() ? [{
          team: row.team || row.username, username: row.username, text,
          submittedAt: Number(row.submitted_at),
        }] : [];
      });
      return { ...question, counts: [], textAnswers, answered: textAnswers.length };
    }
    const counts = question.options.map(() => 0);
    let answered = 0;
    maps.forEach((answers) => {
      const choice = answers[question.id];
      const choices = question.type === 'multiple' ? (Array.isArray(choice) ? choice : []) : [choice];
      const valid = [...new Set(choices.filter((item) => Number.isInteger(item) && counts[item] !== undefined))];
      if (valid.length) answered += 1;
      valid.forEach((item) => { counts[item] += 1; });
    });
    return {
      id: question.id,
      text: question.text,
      type: question.type,
      options: question.options,
      counts,
      answered,
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
  const { type, options } = questionDefinition(req.body);

  const row = await db.one('SELECT COALESCE(MAX(position), 0) AS max_position FROM survey_questions');
  const id = 'q' + crypto.randomBytes(5).toString('hex');

  await db.tx(async (conn) => {
    await conn.query(
      'INSERT INTO survey_questions (id, text, options, position, created_at) VALUES (?,?,?,?,?)',
      [id, text, JSON.stringify(options), Number(row.max_position) + 1, Date.now()]
    );
    await conn.query('INSERT INTO survey_question_types (question_id, type) VALUES (?,?)', [id, type]);
  });

  res.status(201).json({ question: { id, text, options, type } });
}));

/* ---------- конструктор: изменение вопроса ---------- */
router.patch('/questions/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const id = idOf(req.params.id, 'Вопрос');
  const question = await db.tx(async (conn) => {
    const [rows] = await conn.query(`SELECT q.id, q.text, q.options, t.type FROM survey_questions q
      LEFT JOIN survey_question_types t ON t.question_id = q.id WHERE q.id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw new HttpError(404, 'Вопрос не найден');
    const current = readQuestion(rows[0]);
    const text = req.body.text === undefined
      ? current.text
      : str(req.body.text, { field: 'Вопрос', min: 3, max: 500 });
    const { type, options } = questionDefinition(req.body, current);
    if (type !== current.type || JSON.stringify(options) !== JSON.stringify(current.options)) {
      const [responses] = await conn.query('SELECT answers FROM survey_responses');
      if (responses.some((row) => Object.prototype.hasOwnProperty.call(parseObject(row.answers), id))) {
        throw new HttpError(409, 'На этот вопрос уже ответили. Тип и варианты менять нельзя; создайте новый вопрос.');
      }
    }
    await conn.query('UPDATE survey_questions SET text = ?, options = ? WHERE id = ?', [text, JSON.stringify(options), id]);
    await conn.query(`INSERT INTO survey_question_types (question_id, type) VALUES (?,?)
      ON DUPLICATE KEY UPDATE type = VALUES(type)`, [id, type]);
    return { id, text, options, type };
  });

  res.json({ question });
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
