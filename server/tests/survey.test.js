'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(questions, responses = []) {
  const routes = new Map();
  const writes = [];
  let transactions = 0;
  const query = async (sql, params) => {
    if (/SELECT q\.id/.test(sql)) return questions;
    if (/SELECT .*answers|SELECT answers/.test(sql)) return responses;
    writes.push({ sql, params });
    return [];
  };
  const db = {
    query,
    one: async () => ({ total: 5, max_position: 1 }),
    tx: async (fn) => {
      transactions += 1;
      return fn({ query: async (sql, params) => [await query(sql, params)] });
    },
  };
  class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  const router = {};
  for (const method of ['get', 'post', 'patch', 'delete']) {
    router[method] = (url, ...handlers) => routes.set(method + ' ' + url, handlers.at(-1));
  }
  const modules = {
    express: { Router: () => router },
    crypto: require('node:crypto'),
    '../db': db,
    '../event': { isSurveyOpen: async () => true },
    '../auth': { requireAuth: () => {}, requireRole: () => () => {} },
    '../util': {
      HttpError, ah: (fn) => fn, idOf: (id) => id,
      str: (value) => {
        if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'text required');
        return value.trim();
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/routes/survey.js'), 'utf8'), {
    require: (name) => modules[name], module: { exports: {} },
  });
  return {
    writes,
    get transactions() { return transactions; },
    async call(route, body = {}) {
      let result;
      const res = { status() { return this; }, json(value) { result = JSON.parse(JSON.stringify(value)); } };
      await routes.get(route)({ body, params: { id: 'q1' }, user: { id: 'test-user' } }, res);
      return result;
    },
  };
}

const multiple = { id: 'q1', text: 'Question', type: 'multiple', options: ['A', 'B', 'C'] };

test('multiple validates distinct nonempty integer indices without coercion', async () => {
  for (const value of [[], [0, 0], [-1], [3], ['0'], [0.5], null, 0]) {
    const h = harness([multiple]);
    await assert.rejects(h.call('post /submit', { answers: [value] }), { status: 400 });
    assert.equal(h.writes.length, 0);
  }
  const h = harness([multiple]);
  assert.deepEqual((await h.call('post /submit', { answers: [[0, 2]] })).answers, { q1: [0, 2] });
  assert.deepEqual(JSON.parse(h.writes.find((write) => write.sql.includes('INSERT INTO survey_responses')).params[1]), { q1: [0, 2] });
});

test('legacy inference and mixed multi-question submissions stay compatible', async () => {
  const h = harness([
    { id: 'oldChoice', text: 'Choice', options: '["A","B"]' },
    { id: 'oldText', text: 'Text', options: [] },
    multiple,
  ]);
  assert.deepEqual((await h.call('post /submit', { answers: [1, ' hello ', [0, 1]] })).answers,
    { oldChoice: 1, oldText: 'hello', q1: [0, 1] });
});

test('results count respondents rather than total selected options', async () => {
  const h = harness([multiple], [
    { answers: { q1: [0, 1] } }, { answers: '{"q1":[1,2]}' }, { answers: {} },
  ]);
  const result = await h.call('get /results');
  assert.deepEqual(result.questions[0].counts, [1, 2, 1]);
  assert.equal(result.questions[0].answered, 2);
  assert.equal(result.responses, 3);
});

test('creation persists explicit type and options in one transaction', async () => {
  const h = harness([]);
  const result = await h.call('post /questions', { text: 'Question', type: 'multiple', options: ['A', 'B'] });
  assert.equal(result.question.type, 'multiple');
  assert.equal(h.transactions, 1);
  assert.equal(h.writes.filter((write) => /INSERT INTO survey_/.test(write.sql)).length, 2);
});

test('choice to multiple change is blocked after responses even with unchanged options', async () => {
  const h = harness([{ ...multiple, type: 'choice' }], [{ answers: { q1: 0 } }]);
  await assert.rejects(h.call('patch /questions/:id', { type: 'multiple' }), { status: 409 });
  assert.equal(h.writes.length, 0);
});

test('text-only patches preserve multiple type and answered-question guard allows wording edits', async () => {
  const h = harness([multiple], [{ answers: { q1: [0, 1] } }]);
  const result = await h.call('patch /questions/:id', { text: 'New wording' });
  assert.equal(result.question.type, 'multiple');
  assert.deepEqual(result.question.options, multiple.options);
  assert.equal(h.transactions, 1);
});
