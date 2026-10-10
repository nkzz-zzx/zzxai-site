const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'hot100.html'), 'utf8');
// LeetCode top-100-liked official study plan, checked 2026-09-18.
const expected = [1,49,128,283,11,15,42,3,438,560,239,76,53,56,189,238,41,73,54,48,240,160,206,234,141,142,21,2,19,24,25,138,148,23,146,94,104,226,101,543,102,108,98,230,199,114,105,437,236,124,200,994,207,208,46,78,17,39,22,79,131,51,35,74,34,33,153,4,20,155,394,739,84,215,347,295,121,55,45,763,70,118,198,279,322,139,300,152,416,32,62,64,5,1143,72,136,169,75,31,287];
test('covers the exact official 100 problems with complete learning sections', () => {
  const cards = [...page.matchAll(/<details class="problem" id="q-(\d+)"[\s\S]*?<\/details>/g)];
  assert.deepEqual(cards.map(match => Number(match[1])), expected);
  for (const [card, id] of cards) {
    for (const label of ['一步步推导', '跟着例子走一遍', '容易踩的坑：', '复杂度：']) assert.ok(card.includes(label), `${id}: ${label}`);
    assert.equal((card.match(/<li>/g) || []).length, 3, `${id}: three reasoning steps`);
    assert.match(card, /https:\/\/leetcode.cn\/problems\/[^"\s]+\//);
  }
  assert.equal((page.match(/<svg /g) || []).length, 17);
});
test('anchors and homepage entry resolve, publication copies stay identical', () => {
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'unique IDs');
  for (const [, id] of page.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), `anchor ${id}`);
  for (const name of ['index.html', 'hot100.html', 'hot100-demos.js']) {
    assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), fs.readFileSync(path.join(root, 'dist', name), 'utf8'));
  }
  assert.match(page, /src="\.\/hot100-demos\.js"/);
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(index, /href="\.\/hot100.html"/);
  assert.match(index, /6 个工具/);
  for (const [, href] of index.matchAll(/href="\.\/([^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, href)));
});
