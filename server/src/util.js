'use strict';

const ROLE_LABELS = {
  admin: 'Администратор',
  participant: 'Участник',
  volunteer: 'Волонтёр',
};

const TASK_TYPES = ['station', 'quiz', 'game'];

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

/** Обёртка для async-хендлеров Express 4. */
function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function str(value, { field = 'Значение', min = 1, max = 120, trim = true, required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field}: обязательное поле`);
    return '';
  }
  let s = String(value);
  if (trim) s = s.trim();
  if (!s) {
    if (required) throw new HttpError(400, `${field}: обязательное поле`);
    return '';
  }
  if (s.length < min) throw new HttpError(400, `${field}: минимум ${min} символов`);
  if (s.length > max) throw new HttpError(400, `${field}: максимум ${max} символов`);
  return s;
}

function intVal(value, { field = 'Значение', min = 0, max = 100000, def } = {}) {
  if ((value === undefined || value === null || value === '') && def !== undefined) return def;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new HttpError(400, `${field}: нужно целое число`);
  if (n < min || n > max) throw new HttpError(400, `${field}: допустимо от ${min} до ${max}`);
  return n;
}

function num(value, { field = 'Значение', min = -100000, max = 100000, def = null } = {}) {
  if (value === undefined || value === null || value === '') return def;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field}: нужно число`);
  if (n < min || n > max) throw new HttpError(400, `${field}: допустимо от ${min} до ${max}`);
  return n;
}

function roleOf(value) {
  const role = String(value || '');
  if (!Object.prototype.hasOwnProperty.call(ROLE_LABELS, role)) {
    throw new HttpError(400, 'Неизвестная роль');
  }
  return role;
}

function typeOf(value) {
  const type = String(value || '');
  if (!TASK_TYPES.includes(type)) throw new HttpError(400, 'Неизвестный тип задания');
  return type;
}

function idOf(value, field = 'ID') {
  const id = String(value || '');
  if (!/^[a-zA-Z0-9_-]{1,24}$/.test(id)) throw new HttpError(400, `${field}: некорректный`);
  return id;
}

module.exports = { ROLE_LABELS, TASK_TYPES, HttpError, ah, str, intVal, num, roleOf, typeOf, idOf };
