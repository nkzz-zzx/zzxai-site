(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const runner = window.Hot100Runner;
  const prefix = 'zzxai:hot100:draft:v1:';
  const drafts = new Map();
  const unsaved = new Set();
  let questions = [], current, language = 'python', editor, restoring = false, activeRun;
  const comparisonLabels = {
    tokens: '按空白分隔比较答案，忽略多余空格和换行。',
    unorderedTokens: '答案元素的顺序不限。',
    unorderedLines: '每行代表一个答案，行与行的顺序不限。',
    unorderedGroups: '每行代表一组，组内及组间顺序不限；空组按输出格式表示。',
    float: '逐个数值比较，允许 1e−6 的绝对误差。',
    palindrome: '接受任意一个最长回文子串。',
    balancedBST: '接受任意符合输入且高度平衡的二叉搜索树。'
  };

  function notify(message) {
    $('notice').textContent = message;
    $('notice').hidden = !message;
  }

  const draftKey = () => `${prefix}${current.id}:${language}`;
  function saveDraft() {
    if (!current || restoring) return;
    const key = draftKey(), code = editor.getValue();
    drafts.set(key, code);
    try {
      localStorage.setItem(key, code);
      unsaved.delete(key);
      $('draft-status').textContent = '草稿已保存到本机';
    } catch (_) {
      unsaved.add(key);
      $('draft-status').textContent = '草稿仅在当前页面，请下载备份';
      notify('浏览器无法保存草稿。当前页面内切换题目仍会保留代码，关闭前请下载需要的草稿。');
    }
  }

  function restoreDraft() {
    const key = draftKey();
    let code = drafts.get(key);
    if (code === undefined) {
      try { code = localStorage.getItem(key); } catch (_) { code = null; }
    }
    restoring = true;
    editor.setOption('mode', runner.LANGUAGES[language].mode);
    editor.setOption('indentUnit', language === 'python' || language === 'java' ? 4 : 2);
    editor.setValue(code == null ? runner.LANGUAGES[language].template : code);
    editor.clearHistory();
    editor.scrollTo(0, 0);
    restoring = false;
    $('filename').textContent = `hot100-${current.id}.${runner.LANGUAGES[language].extension}`;
    $('draft-status').textContent = unsaved.has(key) ? '草稿仅在当前页面，请下载备份' : code == null ? '开始输入后自动保存草稿' : '已恢复本机草稿';
  }

  function markStale() {
    if ($('results').dataset.complete) $('result-stale').hidden = false;
    if (activeRun) activeRun.edited = true;
  }

  function clearResults() {
    $('results').replaceChildren();
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = '完成实现后，运行一个用例，或检查全部本站用例。';
    $('results').append(p);
    delete $('results').dataset.complete;
    $('result-summary').textContent = '尚未运行';
    $('result-summary').className = '';
    $('result-stale').hidden = true;
    $('diagnostics').hidden = true;
    $('diagnostic-text').textContent = '';
  }

  function fillQuestionSelect() {
    const query = $('question-search').value.trim().toLowerCase();
    const matched = questions.filter(q => !query || (/^\d+$/.test(query) ? String(q.id) === query : `${q.id} ${q.title} ${q.category}`.toLowerCase().includes(query)));
    $('question-select').replaceChildren();
    const groups = new Map();
    for (const q of matched) {
      if (!groups.has(q.category)) {
        const group = document.createElement('optgroup'); group.label = q.category;
        groups.set(q.category, group); $('question-select').append(group);
      }
      groups.get(q.category).append(new Option(`${q.id}. ${q.title}`, q.id));
    }
    if (current && !matched.includes(current)) {
      const group = document.createElement('optgroup'); group.label = matched.length ? '当前题目' : '没有匹配结果 · 当前题目';
      group.append(new Option(`${current.id}. ${current.title}`, current.id)); $('question-select').append(group);
    }
    if (current) $('question-select').value = current.id;
  }

  function outputBlock(label, value) {
    const div = document.createElement('div'), caption = document.createElement('label'), pre = document.createElement('pre');
    caption.textContent = label;
    pre.textContent = value === '' || /^\s*$/.test(value) ? '（空输出）' : value;
    div.append(caption, pre);
    return div;
  }

  function loadCase() {
    const item = current.cases[Number($('case-select').value)];
    $('stdin').value = item.input;
    $('expected').value = item.expected;
    $('compare').checked = true;
    markStale();
  }

  function showQuestion(id, nextLanguage, updateHistory) {
    if (current) saveDraft();
    stopRun();
    current = questions.find(q => q.id === Number(id)) || questions[0];
    language = Object.hasOwn(runner.LANGUAGES, nextLanguage) ? nextLanguage : 'python';
    const index = questions.indexOf(current);
    $('language').value = language;
    fillQuestionSelect();
    $('position').textContent = `第 ${index + 1} / ${questions.length} 题`;
    $('previous').disabled = index === 0;
    $('next').disabled = index === questions.length - 1;
    $('question-title').textContent = `${current.id}. ${current.title}`;
    document.title = `${current.id}. ${current.title} · Hot 100 编码练习`;
    $('category').textContent = current.category;
    $('difficulty').textContent = current.difficulty;
    $('difficulty').className = current.difficultyClass;
    for (const [target, key] of [['statement', 'statement'], ['input-format', 'inputFormat'], ['output-format', 'outputFormat']]) $(target).textContent = current[key];
    $('comparison').textContent = comparisonLabels[current.comparison];
    $('original').href = current.url;
    $('back-link').href = `./hot100.html#q-${current.id}`;
    $('explanation').replaceChildren(...Array.from(current.explanation.childNodes, node => node.cloneNode(true)));
    document.querySelector('.explanation').open = false;
    $('examples').replaceChildren();
    current.cases.slice(0, 2).forEach((item, i) => {
      const box = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div');
      box.className = 'example'; box.open = i === 0;
      summary.textContent = `样例 ${i + 1} · ${item.name}`; body.className = 'example-body';
      body.append(outputBlock('输入', item.input), outputBlock('输出', item.expected));
      box.append(summary, body); $('examples').append(box);
    });
    $('case-select').replaceChildren(...current.cases.map((item, i) => new Option(`用例 ${i + 1} · ${item.name}`, i)));
    loadCase();
    $('judge').textContent = `判题 · 全部 ${current.cases.length} 组`;
    restoreDraft(); clearResults();
    if (updateHistory) {
      const url = new URL(location.href);
      url.searchParams.set('problem', current.id); url.searchParams.set('language', language);
      history.pushState(null, '', url);
    }
  }

  function setBusy(busy) {
    for (const id of ['run', 'judge', 'stdin', 'expected', 'case-select', 'compare']) $(id).disabled = busy;
    $('stop').hidden = !busy;
    $('execution-status').textContent = busy ? '正在编译 / 运行…' : '就绪';
  }

  function stopRun() {
    if (!activeRun) return;
    activeRun.controller.abort(); clearTimeout(activeRun.timer); activeRun = null;
    setBusy(false);
    $('execution-status').textContent = '已停止等待';
    $('result-summary').textContent = '已停止等待';
    $('result-summary').className = '';
    $('results').replaceChildren();
    const p = document.createElement('p'); p.className = 'small'; p.textContent = '已停止接收结果。远端任务仍可能继续执行，服务会自行限制运行时间。'; $('results').append(p);
    $('diagnostics').hidden = true;
  }

  function showDiagnostics(value, includeOutput) {
    const sections = [];
    if (value.compilerOutput) sections.push(`编译日志\n${value.compilerOutput}`);
    if (value.stderr) sections.push(`标准错误\n${value.stderr}`);
    if (includeOutput && value.stdout) sections.push(`标准输出\n${value.stdout}`);
    $('diagnostics').hidden = !sections.length;
    $('diagnostics').open = includeOutput;
    $('diagnostic-text').textContent = sections.join('\n\n').slice(0, 60000);
  }

  async function run(allCases) {
    if (!current || activeRun) return;
    saveDraft();
    const compare = allCases || $('compare').checked;
    const cases = (allCases ? current.cases : [{ name: '当前输入', input: $('stdin').value, expected: $('expected').value }]).map(item => ({ ...item, comparison: current.comparison }));
    const token = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('');
    let payload;
    try { payload = runner.buildRequest(language, editor.getValue(), cases, token); }
    catch (error) { notify(error.message); return; }
    notify(''); clearResults(); setBusy(true);
    $('result-summary').textContent = '等待运行结果';
    const job = { controller: new AbortController(), edited: false, timedOut: false };
    activeRun = job;
    job.timer = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, 60000);
    try {
      const response = await fetch('https://wandbox.org/api/compile.json', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: job.controller.signal
      });
      if (!response.ok) throw new Error(response.status === 429 ? '运行服务限流，请稍后手动重试。' : `运行服务暂不可用（HTTP ${response.status}），请稍后重试。`);
      const data = await response.json();
      if (activeRun !== job) return;
      const parsed = runner.parseResults(data, cases, token);
      $('results').replaceChildren();
      const passed = parsed.results.filter(item => item.passed).length;
      $('result-summary').textContent = compare ? `${passed} / ${cases.length} 通过${allCases ? ' · 本站用例' : ''}` : '运行完成 · 未比较答案';
      $('result-summary').className = compare ? passed === cases.length ? 'pass' : 'fail' : '';
      parsed.results.forEach((item, i) => {
        const details = document.createElement('details'), summary = document.createElement('summary'), title = document.createElement('span'), status = document.createElement('span'), body = document.createElement('div');
        details.className = 'result-case'; details.open = i === 0 || (compare && !item.passed);
        title.textContent = `${i + 1}. ${item.name}`; status.textContent = compare ? item.passed ? '通过' : '答案不一致' : '已运行'; status.className = compare ? item.passed ? 'pass' : 'fail' : '';
        summary.append(title, status);
        body.append(outputBlock('输入', cases[i].input), outputBlock('实际输出', item.output));
        if (compare) body.append(outputBlock('预期输出', item.expected));
        details.append(summary, body); $('results').append(details);
      });
      showDiagnostics(parsed, false);
    } catch (error) {
      if (activeRun !== job) return;
      $('result-summary').textContent = job.timedOut ? '等待超时 · 未判定' : '执行失败 · 未判定';
      $('result-summary').className = 'fail';
      const p = document.createElement('p'); p.className = 'small';
      p.textContent = job.timedOut ? '等待已超过 60 秒。请检查是否存在死循环，或稍后重试；远端任务可能尚未结束。' : error instanceof TypeError ? '无法连接运行服务，请检查网络或稍后重试。草稿仍保留在当前浏览器。' : error.message;
      $('results').replaceChildren(p); showDiagnostics(error, true);
    } finally {
      clearTimeout(job.timer);
      if (activeRun === job) {
        activeRun = null; setBusy(false);
        $('results').dataset.complete = 'true'; $('result-stale').hidden = !job.edited;
      }
    }
  }

  async function initialize() {
    try {
      if (!runner || !window.CodeMirror) throw new Error('编辑器资源未能加载，请刷新页面重试。');
      const [htmlResponse, practiceResponse] = await Promise.all([fetch('./hot100.html'), fetch('./hot100-practice.json')]);
      if (!htmlResponse.ok || !practiceResponse.ok) throw new Error('题目加载失败，请刷新页面重试。');
      const doc = new DOMParser().parseFromString(await htmlResponse.text(), 'text/html');
      const practice = await practiceResponse.json();
      const cards = Array.from(doc.querySelectorAll('.problem'));
      if (practice.length !== 100 || cards.length !== 100) throw new Error('题库数据不完整，请稍后刷新重试。');
      questions = cards.map(card => {
        const id = Number(card.dataset.id), data = practice.find(q => q.id === id);
        if (!data || !data.cases.length) throw new Error('题库数据版本不一致，请刷新重试。');
        const explanation = card.querySelector('.body').cloneNode(true); explanation.querySelector('.links').remove();
        const difficulty = card.querySelector('.difficulty');
        return { ...data, title: card.querySelector('.name').textContent, category: card.closest('.group').querySelector('h2').textContent, difficulty: difficulty.textContent, difficultyClass: difficulty.className, url: card.querySelector('.links a').href, explanation };
      });
      $('language').replaceChildren(...Object.entries(runner.LANGUAGES).map(([key, value]) => new Option(value.label, key)));
      editor = CodeMirror.fromTextArea($('code'), {
        theme: 'material-darker', lineNumbers: true, lineWrapping: false, tabSize: 2, indentUnit: 4,
        matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true, inputStyle: 'textarea',
        extraKeys: { 'Ctrl-Enter': () => run(false), 'Cmd-Enter': () => run(false), Tab: cm => cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection(' '.repeat(cm.getOption('indentUnit'))), 'Shift-Tab': cm => cm.indentSelection('subtract'), Esc: cm => { cm.getInputField().blur(); $('copy').focus(); } }
      });
      editor.getInputField().setAttribute('aria-label', '代码编辑器');
      editor.on('change', () => { if (!restoring) { saveDraft(); markStale(); } });
      document.querySelectorAll('button, select, input, textarea').forEach(element => { element.disabled = false; });
      const params = new URLSearchParams(location.search);
      showQuestion(params.get('problem'), params.get('language'), false);
      if ((params.has('problem') && !questions.some(q => String(q.id) === params.get('problem'))) || (params.has('language') && !Object.hasOwn(runner.LANGUAGES, params.get('language')))) notify('链接中的题号或语言无效，已使用可用选项。');
      $('workspace').setAttribute('aria-busy', 'false');
      $('question-search').addEventListener('input', fillQuestionSelect);
      $('question-select').addEventListener('change', event => showQuestion(event.target.value, language, true));
      $('language').addEventListener('change', event => showQuestion(current.id, event.target.value, true));
      $('previous').addEventListener('click', () => showQuestion(questions[questions.indexOf(current) - 1].id, language, true));
      $('next').addEventListener('click', () => showQuestion(questions[questions.indexOf(current) + 1].id, language, true));
      $('case-select').addEventListener('change', loadCase);
      for (const id of ['stdin', 'expected', 'compare']) $(id).addEventListener('input', markStale);
      $('run').addEventListener('click', () => run(false));
      $('judge').addEventListener('click', () => run(true));
      $('stop').addEventListener('click', stopRun);
      $('reset-code').addEventListener('click', () => { if (confirm('将当前题目、当前语言的草稿恢复为初始模板？')) editor.setValue(runner.LANGUAGES[language].template); });
      $('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(editor.getValue()); notify('代码已复制。'); } catch (_) { notify('复制失败，请在编辑器中全选复制，或下载代码。'); } });
      $('download').addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([editor.getValue()], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = $('filename').textContent; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      window.addEventListener('popstate', () => { const query = new URLSearchParams(location.search); showQuestion(query.get('problem'), query.get('language'), false); });
      window.addEventListener('storage', event => {
        if (event.key === null) {
          for (const key of drafts.keys()) if (key !== draftKey() && !unsaved.has(key)) drafts.delete(key);
          notify('另一个页面清除了本机草稿。当前编辑内容已保留，请按需下载。');
        } else if (event.key === draftKey() && event.newValue !== editor.getValue()) {
          notify('另一个标签页修改了同一份草稿。当前编辑内容已保留；如需保留两个版本，请先下载。');
        } else if (event.key.startsWith(prefix) && !unsaved.has(event.key)) drafts.delete(event.key);
      });
      window.addEventListener('beforeunload', event => { if (unsaved.size) { event.preventDefault(); event.returnValue = ''; } });
    } catch (error) {
      $('question-title').textContent = '暂时无法载入练习';
      $('statement').textContent = '请刷新页面重试，也可通过上方链接继续阅读思路图解。';
      notify(error.message); $('workspace').setAttribute('aria-busy', 'false');
    }
  }
  initialize();
})();
