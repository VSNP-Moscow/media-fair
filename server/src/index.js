'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pkg = require('../package.json');
const config = require('./config');
const db = require('./db');
const { HttpError } = require('./util');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const awardRoutes = require('./routes/awards');
const quizRoutes = require('./routes/quiz');
const gameRoutes = require('./routes/game');
const settingsRoutes = require('./routes/settings');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy ? 1 : false);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, config.corsOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Явный отказ для «чужих» Origin: браузер всё равно заблокирует ответ,
// но мы не выполняем запись от имени постороннего сайта.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !config.corsOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Источник запроса не разрешён' });
  }
  next();
});

app.use(express.json({ limit: '128kb' }));

app.get('/api/health', async (req, res) => {
  try {
    await db.ping();
    res.json({
      ok: true,
      database: 'up',
      version: pkg.version,
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ ok: false, database: 'down', error: 'Нет соединения с базой данных' });
  }
});

app.get('/', (req, res) => {
  res.json({ name: 'Медиаярмарка API', version: pkg.version, health: '/api/health' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/awards', awardRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/settings', settingsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Метод API не найден' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некорректный JSON в запросе' });
  }
  console.error('[api] необработанная ошибка:', err);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

async function waitForDatabase(tries = 40, delayMs = 2000) {
  for (let i = 1; i <= tries; i += 1) {
    try {
      await db.ping();
      return;
    } catch (err) {
      if (i === tries) throw err;
      if (i === 1 || i % 5 === 0) {
        console.log(`[api] ожидание MySQL (${i}/${tries}): ${err.code || err.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  if (!config.isProd) {
    console.log('[api] режим разработки');
  }
  await waitForDatabase();

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[api] Медиаярмарка API слушает :${config.port}, окружение ${config.env}`);
  });

  const shutdown = (signal) => {
    console.log(`[api] получен ${signal}, останавливаюсь`);
    server.close(() => {
      db.pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[api] не удалось запуститься:', err);
  process.exit(1);
});

module.exports = app;
