'use strict';

require('dotenv').config();

function int(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Переменная окружения ${name} должна быть числом`);
  return n;
}

function list(name) {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: int('PORT', 8080),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: int('DB_PORT', 3306),
    user: process.env.DB_USER || 'mf_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'media_fair',
    connectionLimit: int('DB_POOL', 6),
  },
  jwtSecret: process.env.JWT_SECRET || '',
  jwtTtl: process.env.JWT_TTL || '12h',
  corsOrigins: list('CORS_ORIGINS'),
  loginWindowMs: int('LOGIN_WINDOW_MS', 10 * 60 * 1000),
  loginMaxAttempts: int('LOGIN_MAX_ATTEMPTS', 20),
  trustProxy: process.env.TRUST_PROXY === 'true',
};

config.isProd = config.env === 'production';

if (config.isProd) {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET должен быть не короче 32 символов');
  }
  if (!config.db.password) {
    throw new Error('DB_PASSWORD не задан');
  }
  if (config.corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS не задан');
  }
}

module.exports = config;
