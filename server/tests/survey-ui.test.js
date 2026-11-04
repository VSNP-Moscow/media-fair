'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function participantHarness() {
  const elements = new Map();
  const listeners = new Map();
  const fields = {};
  const submitted = [];
  let data = { open: true, submitted: false, questions: [
    { id: 'one', text: 'Single', type: 'choice', options: ['A', 'B'] },
    { id: 'many', text: 'Multiple', type: 'multiple', options: ['A', 'B'] },
    { id: 'text', text: 'Text', type: 'text', options: [] },
  ] };
  let dirty = false;
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      style: {}, innerHTML: '', value: '', addEventListener: (event, fn) => listeners.set(id + ':' + event, fn), focus() {},
    });
    return elements.get(id);
  };
  const window = { __MF: {
    init: async () => null, escapeHtml: (s) => s,
    getSurvey: async () => data,
    submitSurvey: async (answers) => submitted.push(JSON.parse(JSON.stringify(answers))),
    showAlert: () => {}, hideAlert: () => {},
  } };
  let source = fs.readFileSync(path.join(__dirname, '../../participant.js'), 'utf8');
  source = source.replace('  (async function boot()', '  window.testSurvey = { loadSurvey, renderSurvey };\n  (async function boot()');
  vm.runInNewContext(source, {
    window,
    document: {
      getElementById: element,
      querySelector: (selector) => selector === '#surveyFields input:checked' ? (dirty ? {} : null) : (fields[selector] || [])[0],
      querySelectorAll: (selector) => fields[selector] || [],
    },
  });
  return { window, element, fields, listeners, submitted,
    change(next) { data = next; }, setDirty(value) { dirty = value; },
  };
}

test('participant renders all three question types and submits arrays only for multiple', async () => {
  const h = participantHarness();
  await h.window.testSurvey.loadSurvey(true);
  const html = h.element('surveyFields').innerHTML;
  assert.match(html, /type="radio" name="sq_one"/);
  assert.match(html, /type="checkbox" name="sq_many"/);
  assert.match(html, /<textarea id="sq_text_2"/);
  h.fields['input[name="sq_one"]:checked'] = [{ value: '1' }];
  h.fields['input[name="sq_many"]:checked'] = [{ value: '0' }, { value: '1' }];
  h.element('sq_text_2').value = ' hello ';
  await h.listeners.get('surveyForm:submit')({ preventDefault() {} });
  assert.deepEqual(h.submitted, [[1, [0, 1], 'hello']]);
});

test('checked checkboxes prevent polling from replacing unsent answers', async () => {
  const h = participantHarness();
  await h.window.testSurvey.loadSurvey(true);
  const before = h.element('surveyFields').innerHTML;
  h.setDirty(true);
  h.change({ open: true, submitted: false, questions: [{ id: 'new', type: 'text', text: 'New' }] });
  await h.window.testSurvey.loadSurvey(false);
  assert.equal(h.element('surveyFields').innerHTML, before);
});

test('empty multiple selection is not submitted', async () => {
  const h = participantHarness();
  await h.window.testSurvey.loadSurvey(true);
  h.fields['input[name="sq_one"]:checked'] = [{ value: '1' }];
  await h.listeners.get('surveyForm:submit')({ preventDefault() {} });
  assert.equal(h.submitted.length, 0);
});
