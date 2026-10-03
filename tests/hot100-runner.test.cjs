const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { LANGUAGES, buildRequest, parseResults, compareOutput } = require('../hot100-runner.js');

const token = 'test-run-1234';
const cases = [{ name: '第一例', input: '2 7\nignored\n', expected: '9' }, { name: '第二例', input: '3 4\n', expected: '7' }];
function response(outputs) {
  return { status: '0', signal: '', compiler_error: 'warning only\n', program_error: 'debug output\n', program_output: outputs.map((output, i) => `__HOT100_${token}_${i}_BEGIN__\n${output}\n__HOT100_${token}_${i}_END__\n`).join('') };
}

test('all five payloads isolate case inputs and never send expected answers', () => {
  assert.deepEqual(Object.keys(LANGUAGES), ['python', 'javascript', 'cpp', 'java', 'go']);
  const privateCases = cases.map(item => ({ ...item, expected: 'EXPECTED_SECRET' }));
  for (const [language, definition] of Object.entries(LANGUAGES)) {
    const payload = buildRequest(language, definition.template, privateCases, token);
    assert.equal(payload.compiler, definition.compiler);
    assert.equal(payload.save, false);
    assert.equal(payload.stdin, '');
    assert.ok(!JSON.stringify(payload).includes('EXPECTED_SECRET'));
    assert.ok(JSON.stringify(payload).includes(token));
  }
  assert.match(buildRequest('java', LANGUAGES.java.template, cases, token).code, /class Wandbox/);
  assert.equal(buildRequest('go', LANGUAGES.go.template, cases, token).codes[0].file, 'hot100_driver.go');
  assert.throws(() => buildRequest('python', '', cases, token), /填写代码/);
  assert.throws(() => buildRequest('python', 'pass', cases, 'bad token'), /运行标识/);
});

test('result parsing requires successful completion and exact boundaries, preserves diagnostics', () => {
  const parsed = parseResults(response(['9\n', '8']), cases, token);
  assert.deepEqual(parsed.results.map(result => result.passed), [true, false]);
  assert.equal(parsed.stderr, 'debug output\n');
  assert.equal(parsed.compilerOutput, 'warning only\n');
  assert.equal(parsed.results[0].output, '9\n');
  assert.throws(() => parseResults({ ...response(['9', '7']), status: '' }, cases, token), /未正常完成/);
  assert.throws(() => parseResults({ ...response(['9', '7']), status: '1' }, cases, token), /失败/);
  assert.throws(() => parseResults({ ...response(['9', '7']), signal: 'Killed' }, cases, token), /被中止/);
  assert.throws(() => parseResults(response(['9']), cases, token), /边界缺失/);
  assert.throws(() => parseResults({ ...response(['9', '7']), program_output: response(['9', '7']).program_output + 'extra' }, cases, token), /额外输出/);
  assert.throws(() => parseResults(response(['9', '7']), cases, 'different-token'), /边界缺失/);
  assert.deepEqual(parseResults({ ...response(['9', '7']), program_output: response(['9', '7']).program_output.replace(/\n/g, '\r\n') }, cases, token).results.map(result => result.passed), [true, true]);
});

test('the JavaScript driver invokes each case once with isolated input and shared program globals', () => {
  const checks = [{ input: 'first\nunread', expected: '1 first' }, { input: 'second', expected: '2 second' }];
  const code = 'let calls = 0; function solve(input) { return `${++calls} ${input.split("\\n")[0]}`; }';
  const payload = buildRequest('javascript', code, checks, token);
  const stdout = execFileSync(process.execPath, ['-e', payload.code], { encoding: 'utf8' });
  const parsed = parseResults({ status: '0', signal: '', program_output: stdout }, checks, token);
  assert.deepEqual(parsed.results.map(result => result.passed), [true, true]);
  assert.throws(() => execFileSync(process.execPath, ['-e', buildRequest('javascript', LANGUAGES.javascript.template, checks, token).code], { stdio: 'pipe' }), error => error.status !== 0 && error.stderr.toString().includes('请先实现 solve'));
});

test('comparisons preserve duplicates, ordered groups, tolerance and valid alternative palindromes', () => {
  assert.equal(compareOutput('1  2\n', '1\n2'), true);
  assert.equal(compareOutput('2 1', '1 2'), false);
  assert.equal(compareOutput('2 1 1', '1 2 1', 'unorderedTokens'), true);
  assert.equal(compareOutput('1 2', '1 2 1', 'unorderedTokens'), false);
  assert.equal(compareOutput('3 4\n1 2', '1 2\n3 4', 'unorderedLines'), true);
  assert.equal(compareOutput('2 1', '1 2', 'unorderedLines'), false);
  assert.equal(compareOutput('eat tea\ntan ant', 'ant tan\ntea eat', 'unorderedGroups'), true);
  assert.equal(compareOutput('1.0000001', '1', 'float'), true);
  assert.equal(compareOutput('1.5000014', '1.5', 'float'), false);
  assert.equal(compareOutput('1000000.1', '1000000', 'float'), false);
  assert.equal(compareOutput('Infinity', '1', 'float'), false);
  assert.equal(compareOutput('1.01', '1', 'float'), false);
  assert.equal(compareOutput('aba', 'bab', 'palindrome', 'babad\n'), true);
  assert.equal(compareOutput('bad', 'bab', 'palindrome', 'babad\n'), false);
  assert.equal(compareOutput('aaa', 'bab', 'palindrome', 'babad\n'), false);
});

test('balanced BST allows different roots but checks values, shape, ordering and balance', () => {
  const input = '5\n-10 -3 0 5 9\n';
  assert.equal(compareOutput('[0,-3,9,-10,null,5]', '', 'balancedBST', input), true);
  assert.equal(compareOutput('0 -10 5 null -3 null 9', '', 'balancedBST', input), true);
  assert.equal(compareOutput('0 -10 5 null -3 null 10', '', 'balancedBST', input), false);
  assert.equal(compareOutput('0 9 -3 5 null -10', '', 'balancedBST', input), false);
  assert.equal(compareOutput('-10 null -3 null 0 null 5 null 9', '', 'balancedBST', input), false);
  assert.equal(compareOutput('0 -3 9 -10 null 5 100', '', 'balancedBST', input), false);
  assert.equal(compareOutput('null 1', '', 'balancedBST', '0\n'), false);
  assert.equal(compareOutput('[]', '', 'balancedBST', '0\n'), true);
});
