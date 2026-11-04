'use strict';

const db = require('./db');
const { HttpError, str } = require('./util');

const MAX_MEMBERS = 3;

function normalizeMembers(value, { required = true } = {}) {
  if (value === undefined) {
    if (required) throw new HttpError(400, 'Состав команды: обязательное поле');
    return undefined;
  }
  if (!Array.isArray(value)) throw new HttpError(400, 'Состав команды: нужен массив');
  if (value.length < 1 || value.length > MAX_MEMBERS) {
    throw new HttpError(400, 'Состав команды: от 1 до 3 участников');
  }
  return value.map((member, index) => {
    if (!member || typeof member !== 'object' || Array.isArray(member)) {
      throw new HttpError(400, `Участник ${index + 1}: некорректный формат`);
    }
    for (const field of ['firstName', 'lastName', 'className']) {
      if (typeof member[field] !== 'string') {
        throw new HttpError(400, `Участник ${index + 1}, ${field}: нужна строка`);
      }
    }
    return {
      firstName: str(member.firstName, { field: `Участник ${index + 1}, имя`, min: 1, max: 80 }),
      lastName: str(member.lastName, { field: `Участник ${index + 1}, фамилия`, min: 1, max: 80 }),
      className: str(member.className, { field: `Участник ${index + 1}, класс`, min: 1, max: 32 }),
    };
  });
}

async function readMembers(userId) {
  const rows = await db.query(
    'SELECT first_name AS firstName, last_name AS lastName, class_name AS className FROM team_members WHERE user_id = ? ORDER BY position',
    [userId]
  );
  return rows;
}

async function saveMembers(conn, userId, members) {
  await conn.query('DELETE FROM team_members WHERE user_id = ?', [userId]);
  for (let i = 0; i < members.length; i += 1) {
    const member = members[i];
    await conn.query(
      'INSERT INTO team_members (user_id, position, first_name, last_name, class_name) VALUES (?,?,?,?,?)',
      [userId, i + 1, member.firstName, member.lastName, member.className]
    );
  }
}

module.exports = { normalizeMembers, readMembers, saveMembers };
