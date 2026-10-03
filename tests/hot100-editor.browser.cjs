// UI contract checks only: Wandbox responses are mocked, never executed remotely.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.HOT100_EDITOR_URL || 'http://127.0.0.1:8768/hot100-editor.html';
const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const queue = [], errors = [];
  let calls = 0, checks = 0;
  const addMock = (response, paused = false) => {
    const mock = { response, paused, started: deferred(), release: deferred(), done: deferred() };
    queue.push(mock);
    return mock;
  };
  await context.route('https://wandbox.org/**', async route => {
    calls++;
    const mock = queue.shift();
    if (!mock) {
      errors.push('Unexpected Wandbox request; blocked instead of contacting the service.');
      return route.abort();
    }
    mock.payload = route.request().postDataJSON();
    mock.started.resolve();
    if (mock.paused) await mock.release.promise;
    try {
      const token = mock.payload.code.match(/__HOT100_([a-f0-9]+)_/)[1];
      const body = mock.response.outputs ? {
        status: '0', signal: '', compiler_error: '', program_error: '',
        program_output: mock.response.outputs.map((output, i) => `__HOT100_${token}_${i}_BEGIN__\n${output}\n__HOT100_${token}_${i}_END__\n`).join('')
      } : mock.response.body || {};
      await route.fulfill({ status: mock.response.http || 200, contentType: 'application/json', body: JSON.stringify(body) });
    } catch (error) {
      errors.push(error.message);
    } finally {
      mock.done.resolve();
    }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const ready = async target => {
    await target.locator('#workspace[aria-busy="false"]').waitFor();
    assert(await target.locator('#run').isEnabled(), 'Editor initialization failed');
  };
  const text = async (selector, expected) => {
    await page.waitForFunction(([selector, expected]) => document.querySelector(selector).textContent.includes(expected), [selector, expected]);
  };
  const setCode = (target, code) => target.evaluate(code => document.querySelector('.CodeMirror').CodeMirror.setValue(code), code);
  const getCode = target => target.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
  const choose = async id => {
    await page.locator('#question-select').selectOption(String(id));
    await text('#question-title', `${id}.`);
  };
  const idle = async () => {
    assert(await page.locator('#run').isEnabled());
    assert(await page.locator('#judge').isEnabled());
    assert(await page.locator('#stop').isHidden());
  };
  const pass = name => { checks++; console.log(`PASS ${name}`); };
  try {
    await page.goto(`${url}${url.includes('?') ? '&' : '?'}problem=1&language=python`);
    await ready(page);
    const python = 'def solve():\n    print("draft-python")\n';
    const javascript = 'function solve(input) { return "draft-js"; }\n';
    await setCode(page, python);
    await choose(49);
    await setCode(page, 'def solve():\n    print("other-question")\n');
    await choose(1);
    assert.equal(await getCode(page), python);
    await page.locator('#language').selectOption('javascript');
    await setCode(page, javascript);
    await page.locator('#language').selectOption('python');
    assert.equal(await getCode(page), python);
    await page.reload();
    await ready(page);
    assert.equal(await getCode(page), python);
    pass('drafts survive question/language changes and refresh');

    await setCode(page, '');
    await page.locator('#language').selectOption('javascript');
    assert.equal(await getCode(page), javascript);
    await page.locator('#language').selectOption('python');
    assert.equal(await getCode(page), '');
    await page.reload();
    await ready(page);
    assert.equal(await getCode(page), '', 'Empty drafts must not be replaced by a template');
    await setCode(page, python);
    await choose(49);
    await page.goBack();
    await text('#question-title', '1.');
    assert.equal(await getCode(page), python);
    pass('empty drafts and browser Back retain the correct editor state');

    await choose(49);
    await page.evaluate(() => {
      window.testStorageKeys = [];
      window.addEventListener('storage', event => window.testStorageKeys.push(event.key));
    });
    const second = await context.newPage();
    await second.goto(`${url}${url.includes('?') ? '&' : '?'}problem=1&language=python`);
    await ready(second);
    const newer = 'def solve():\n    print("new-from-second-tab")\n';
    await setCode(second, newer);
    await page.waitForFunction(() => window.testStorageKeys.includes('zzxai:hot100:draft:v1:1:python'));
    await second.close();
    await choose(1);
    assert.equal(await getCode(page), newer, 'Inactive cached drafts must follow storage changes');
    await choose(49);
    assert.equal(await page.evaluate(() => localStorage.getItem('zzxai:hot100:draft:v1:1:python')), newer);
    await choose(1);
    pass('another tab cannot be silently overwritten by an inactive stale cache');

    addMock({ http: 429 });
    await page.locator('#run').click();
    await text('#result-summary', '未判定');
    await text('#results', '限流');
    await idle();
    pass('HTTP 429 is an execution failure, not a wrong-answer verdict');

    addMock({ body: { status: '1', compiler_error: 'mock compiler error', program_output: '', program_error: '' } });
    await page.locator('#judge').click();
    await text('#result-summary', '未判定');
    await text('#diagnostic-text', 'mock compiler error');
    assert(await page.locator('#diagnostics').isVisible());
    await idle();
    pass('compiler errors expose diagnostics without claiming a verdict');

    addMock({ outputs: ['definitely-wrong'] });
    await page.locator('#run').click();
    await text('#result-summary', '0 / 1');
    await text('#results', '答案不一致');
    await text('#results', 'definitely-wrong');
    pass('a completed run with the wrong answer receives a failed verdict');

    const cancel = addMock({ outputs: ['late-cancelled-output'] }, true);
    await page.locator('#run').click();
    await cancel.started.promise;
    assert(await page.locator('#run').isDisabled());
    assert(await page.locator('#stop').isVisible());
    await page.locator('#stop').click();
    await text('#result-summary', '已停止等待');
    await idle();
    cancel.release.resolve();
    await cancel.done.promise;
    assert(!(await page.locator('#results').textContent()).includes('late-cancelled-output'));
    pass('cancel restores controls and discards late results');

    const switched = addMock({ outputs: ['late-previous-question'] }, true);
    await page.locator('#run').click();
    await switched.started.promise;
    await choose(49);
    await text('#result-summary', '尚未运行');
    await idle();
    switched.release.resolve();
    await switched.done.promise;
    assert(!(await page.locator('#results').textContent()).includes('late-previous-question'));
    assert((await page.locator('#question-title').textContent()).startsWith('49.'));
    pass('switching questions aborts the old run without contaminating the new question');

    await choose(1);
    const expected = await page.locator('#expected').inputValue();
    const edited = addMock({ outputs: [expected] }, true);
    const beforeRun = await getCode(page);
    await page.locator('#run').click();
    await edited.started.promise;
    assert(edited.payload.code.includes(beforeRun));
    await setCode(page, `${beforeRun}\n# edited while running\n`);
    edited.release.resolve();
    await text('#result-summary', '1 / 1');
    assert(await page.locator('#result-stale').isVisible());
    assert((await getCode(page)).includes('edited while running'));
    const cases = await page.evaluate(async () => (await (await fetch('./hot100-practice.json')).json()).find(q => q.id === 1).cases);
    addMock({ outputs: cases.map(item => item.expected) });
    await page.locator('#judge').click();
    await text('#result-summary', `${cases.length} / ${cases.length}`);
    assert(await page.locator('#result-stale').isHidden());
    await idle();
    pass('edits during a run mark its result stale; a new batch run clears that state');

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const id of [4, 208, 1143]) {
        await choose(id);
        await setCode(page, '# ' + 'long-unwrapped-line-'.repeat(30));
        const dimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        assert(dimensions.document <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, `Mobile overflow: ${JSON.stringify(dimensions)}`);
      }
    }
    pass('320px and 390px layouts do not overflow, including long editor lines');
    assert.equal(queue.length, 0, 'Unused response mocks');
    assert.deepEqual(errors, [], 'Unexpected requests, browser errors, or mock failures');
    console.log(`${checks} UI contract checks passed; ${calls} Wandbox requests mocked; no remote compilation performed.`);
  } finally {
    for (const mock of queue) mock.release.resolve();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
