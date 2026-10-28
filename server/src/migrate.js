'use strict';

/**
 * Применяет server/sql/schema.sql к базе.
 * В Docker схема создаётся автоматически при первом старте MySQL
 * (/docker-entrypoint-initdb.d), этот скрипт нужен для ручного повторного прогона.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  try {
    await conn.query(sql);
    console.log('[migrate] схема применена');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[migrate] ошибка:', err.message);
  process.exit(1);
});
