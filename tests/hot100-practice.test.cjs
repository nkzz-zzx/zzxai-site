const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compareOutput, LANGUAGES } = require('../hot100-runner.js');
const root = path.join(__dirname, '..');
const practice = require('../hot100-practice.json');

test('all 100 existing questions have editable practice entries and valid test contracts', () => {
  const html = fs.readFileSync(path.join(root, 'hot100.html'), 'utf8');
  const ids = [...html.matchAll(/<details class="problem" id="q-(\d+)"/g)].map(match => Number(match[1]));
  assert.equal(ids.length, 100);
  assert.deepEqual(practice.map(q => q.id), ids);
  assert.deepEqual([...html.matchAll(/class="practice-link" href="\.\/hot100-editor.html\?problem=(\d+)"/g)].map(match => Number(match[1])), ids);
  for (const q of practice) {
    for (const field of ['statement', 'inputFormat', 'outputFormat', 'comparison']) assert.ok(typeof q[field] === 'string' && q[field].length, `${q.id}: ${field}`);
    assert.ok(q.cases.length >= 3, `${q.id}: normal and boundary cases`);
    for (const item of q.cases) {
      for (const field of ['name', 'input', 'expected']) assert.equal(typeof item[field], 'string', `${q.id}: ${field}`);
      assert.ok(compareOutput(item.expected, item.expected, q.comparison, item.input), `${q.id}: expected fits comparison contract`);
    }
  }
  assert.deepEqual(Object.keys(LANGUAGES), ['python', 'javascript', 'cpp', 'java', 'go']);
});

test('deployed editor assets match source, including the local editor license', () => {
  for (const name of ['hot100-editor.html', 'hot100-editor.css', 'hot100-editor.js', 'hot100-practice.json', 'hot100-runner.js', 'vendor/codemirror.js', 'vendor/codemirror.css', 'vendor/codemirror-LICENSE']) {
    assert.deepEqual(fs.readFileSync(path.join(root, name)), fs.readFileSync(path.join(root, 'dist', name)), name);
  }
});
