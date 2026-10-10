(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const engine = window.STZBDraw;
  const key = 'stzb-draw-v1';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const format = n => n.toLocaleString('zh-CN');
  let data, state, pool, category = 'regular', recordView = 'collection', busy = false, queue = [];
  let pendingConfirmation = null;
  let pendingResults = [], stopIntro = () => {};
  let storageWorks = true;
  let prefs = { poolId: 'dongwu', fast: false };

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify({ dataVersion: data.version, state, prefs }));
      storageWorks = true;
    } catch { storageWorks = false; }
    $('storage-status').textContent = storageWorks ? '记录仅保存在当前浏览器，最近记录保留 200 次。' : '浏览器未允许保存；记录暂存于本页，关闭或刷新后会丢失。';
  }

  const metadata = card => [card.country, card.troop && `${card.troop}兵`, card.variant].filter(Boolean).join(' · ') || '名单待核实 · 星级占位';
  function cardArt(card, target = false) {
    return `<div class="result-art">${card.portrait ? `<img src="${escape(card.portrait)}" alt="${escape(card.name)}官方画像" loading="lazy">` : `<div class="generic-art"><span>${card.rarity === 4 ? '将' : '士'}</span><small>星级占位</small></div>`}<span class="card-stars" aria-label="${card.rarity}星">${'★'.repeat(card.rarity)}</span>${target ? '<span class="target-tag">心仪武将</span>' : ''}</div>`;
  }

  function eligible() {
    return [...new Set(data.pools.filter(p => p.id === pool.id || (pool.wishGroup && p.wishGroup === pool.wishGroup)).flatMap(p => p.roster[5]))];
  }

  function renderPoolList() {
    document.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', b.dataset.category === category));
    $('pool-list').innerHTML = data.pools.filter(p => p.category === category).map(p => `<button class="pool-option" data-pool="${escape(p.id)}" aria-pressed="${p.id === pool.id}"><strong>${escape(p.name)}</strong><small>${escape(p.subtitle)}</small></button>`).join('');
  }

  function renderPool() {
    $('pool-name').textContent = pool.name;
    $('pool-kicker').textContent = pool.kicker;
    $('pool-summary').textContent = pool.summary;
    $('stage-portrait').src = data.cards[pool.cover].portrait;
    $('stage-portrait').alt = `${data.cards[pool.cover].name}官方画像`;
    renderPoolList();
    update();
  }

  function update() {
    const { stats, pity, wish } = engine.context(state, pool);
    const card = data.cards[wish.id];
    $('wish-label').textContent = pool.wishCap ? '心愿武将' : '收藏目标';
    $('wish-name').textContent = card ? `${card.name} · ${card.country}${card.variant ? ` · ${card.variant}` : ''}` : '选择心仪的五星武将';
    $('wish-avatar').innerHTML = card ? `<img src="${escape(card.portrait)}" alt="">` : '愿';
    $('wish-subtitle').textContent = card ? `${card.troop}兵 · 已获得 ${wish.hits} 次目标 · 点击更换` : '点击选择 →';
    $('wish-progress-label').textContent = pool.wishCap ? '心愿积分' : '目标收藏';
    $('wish-points').textContent = pool.wishCap ? `${format(wish.points)} / ${format(pool.wishCap)}` : card ? `${state.collection[wish.id] || 0} 张` : '尚未选择';
    $('wish-progress').hidden = !pool.wishCap;
    $('wish-progress').max = pool.wishCap || 1;
    $('wish-progress').value = wish.points;
    const inPool = pool.roster[5].includes(wish.id);
    $('wish-hint').textContent = !pool.wishCap ? '此标准活动包仅追踪收藏目标，不增加概率。' : !wish.id ? '先选择心愿武将；积分达到上限后，下一抽必得。' : !inPool ? '积分跨阵营累积；需切换至目标所属卡包才能获得。' : wish.points >= pool.wishCap ? '心愿已满，下一抽必定获得目标武将。' : `三星 +10 · 四星 +20 · 五星 +150${pool.wishGroup === 'factions' ? '；四阵营共享积分' : ''}`;
    $('pity-text').textContent = pool.maxDraws ? `本轮第 ${pool.guaranteedAt} 抽必得五星` : `距离五星保底 ${Math.max(1, pool.fivePity - pity.noFive)} 抽`;
    $('four-text').textContent = pool.fourPity ? `四星以上还需 ${Math.max(1, pool.fourPity - pity.threeStreak)} 抽` : pool.maxDraws ? '每次均为四星或五星' : '三星／四星使用星级占位';
    if (pool.id === 'kaiguo') $('four-text').textContent = '心愿积分独立累计';
    for (const [id, n] of [['one', 1], ['five', 5]]) {
      const unavailable = pool.maxDraws && stats.draws + n > pool.maxDraws;
      $(`draw-${id}`).disabled = busy || Boolean(unavailable);
      $(`${id}-cost`).textContent = unavailable ? '本轮次数不足' : (() => { const amount = engine.costFor(pool, stats.draws, n); return amount === 0 ? '本轮免费' : `${format(amount)} 模拟${pool.currency || '虎符'}`; })();
    }
    $('pool-count').textContent = pool.maxDraws ? `本轮已招募 ${stats.draws} / ${pool.maxDraws} 次 · 五星 ${stats.fives} 张` : `此包已招募 ${format(stats.draws)} 次 · 五星 ${format(stats.fives)} 张`;
    $('restart-event').hidden = !pool.maxDraws;
    $('stat-draws').textContent = format(state.total);
    $('stat-fives').textContent = format(state.stars[5]);
    $('stat-rate').textContent = state.total ? `${(100 * state.stars[5] / state.total).toFixed(1)}%` : '—';
    $('stat-cost').textContent = format(state.cost);
    if (!busy) renderRecords();
  }

  function renderRecords() {
    const owned = Object.entries(state.collection).filter(([id, count]) => count && data.cards[id].rarity === 5).sort((a, b) => b[1] - a[1]);
    $('collection-count').textContent = owned.length;
    document.querySelectorAll('[data-record]').forEach(b => b.setAttribute('aria-pressed', b.dataset.record === recordView));
    if (recordView === 'collection') {
      $('records').innerHTML = owned.length ? `<div class="collection-grid">${owned.map(([id, count]) => {
        const c = data.cards[id];
        return `<article class="result-card rarity-5">${cardArt(c)}<h3>${escape(c.name)}</h3><p>${escape(metadata(c))} · ${count} 张</p></article>`;
      }).join('')}</div>` : '<p class="empty-record">尚无五星入藏。金光亮起时，名将将留在这里。</p>';
    } else {
      $('records').innerHTML = state.history.length ? `<ol class="history-list">${state.history.map(h => {
        const c = data.cards[h.id], p = data.pools.find(p => p.id === h.poolId);
        return `<li><span class="history-number">#${h.number}</span><span class="history-name"><strong>${escape(c.name)}${h.isWish ? ' · 心仪武将' : ''}</strong><small>${escape(metadata(c))} / ${escape(p.name)}${h.reason ? ` / ${escape(h.reason)}` : ''}</small></span><span class="history-stars" aria-label="${h.rarity}星">${'★'.repeat(h.rarity)}</span></li>`;
      }).join('')}</ol>` : '<p class="empty-record">开始招募后，可在这里回看最近 200 次结果。</p>';
    }
  }

  function renderPicker() {
    const term = $('wish-search').value.trim().toLowerCase();
    const { wish } = engine.context(state, pool);
    const ids = eligible().filter(id => `${data.cards[id].name}${metadata(data.cards[id])}`.toLowerCase().includes(term));
    $('wish-grid').innerHTML = ids.map(id => {
      const c = data.cards[id];
      return `<button class="mini-card rarity-5" data-wish="${escape(id)}" aria-pressed="${wish.id === id}">${cardArt(c)}<h3>${escape(c.name)}</h3><p>${escape(metadata(c))}</p></button>`;
    }).join('') || '<p class="empty-record">没有匹配的武将。</p>';
  }

  const sourceLinks = sources => sources.map(s => `<a href="${escape(s.url)}" target="_blank" rel="noopener">${escape(s.title)} ↗</a>`).join('');
  function openRoster() {
    $('roster-title').textContent = pool.name;
    $('roster-note').textContent = pool.rosterNote;
    $('roster-rules').innerHTML = `${escape(pool.ruleNote)}<br>五星 ${pool.rates[5] * 100}% · 四星 ${pool.rates[4] * 100}%${pool.rates[3] ? ` · 三星 ${pool.rates[3] * 100}%` : ''}（${pool.category === 'event' ? '演示参数，非官方活动概率' : '以公示值为基础的模拟参数，保底另计'}）<br>同星级等权；心愿提升曲线为模拟设定。${pool.wishCap ? `心愿积分上限 ${format(pool.wishCap)}。` : '收藏目标不改变概率。'}`;
    $('roster-grid').innerHTML = [5, 4, 3].flatMap(r => pool.roster[r] || []).map(id => {
      const c = data.cards[id];
      return `<article class="mini-card rarity-${c.rarity}">${cardArt(c)}<h3>${escape(c.name)}</h3><p>${escape(metadata(c))}</p></article>`;
    }).join('');
    $('roster-sources').innerHTML = sourceLinks(pool.sources);
    $('roster-dialog').showModal();
  }

  function confirmAction(title, message, action) {
    pendingConfirmation = action;
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    $('confirm-dialog').showModal();
  }

  function showNextReveal() {
    stopIntro();
    const result = queue.shift();
    if (!result) { $('reveal').close(); return; }
    const card = data.cards[result.id];
    $('reveal-kicker').textContent = result.isWish ? '心有所愿 · 终得相逢' : '金光乍现 · 名将来归';
    $('reveal-name').textContent = card.name;
    $('reveal-image').src = card.portrait;
    $('reveal-image').alt = `${card.name}官方画像`;
    $('reveal-meta').textContent = `${metadata(card)}${result.reason ? ` · ${result.reason}` : ''}`;
    $('next-reveal').textContent = queue.length ? `下一位名将 · 还有 ${queue.length} 位` : '收入麾下';
    $('next-reveal').disabled = true;
    $('reveal').classList.add('playing-intro');
    $('reveal').setAttribute('aria-labelledby', 'intro-label');
    $('reveal-intro').hidden = false;
    if (!$('reveal').open) $('reveal').showModal();
    const video = $('reveal-video');
    let active = true;
    const finish = () => {
      if (!active) return;
      stopIntro();
      $('reveal-intro').hidden = true;
      $('reveal').classList.remove('playing-intro');
      $('reveal').setAttribute('aria-labelledby', 'reveal-name');
      $('next-reveal').disabled = false;
      $('reveal').getAnimations({ subtree: true }).forEach(animation => { animation.cancel(); animation.play(); });
      $('next-reveal').focus({ preventScroll: true });
    };
    const timeout = setTimeout(finish, 10000);
    stopIntro = () => {
      active = false;
      clearTimeout(timeout);
      video.pause();
      video.removeEventListener('ended', finish);
      video.removeEventListener('error', finish);
    };
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    video.currentTime = 0;
    video.play().catch(finish);
  }

  function revealResults() {
    $('last-results').innerHTML = pendingResults.map((r, i) => {
      const card = data.cards[r.id];
      return `<article class="result-card rarity-${r.rarity}" style="--delay:${i * .07}s">${cardArt(card, r.isWish)}<h3>${escape(card.name)}</h3><p>${escape(metadata(card))}${r.reason ? `<br>${escape(r.reason)}` : ''}</p></article>`;
    }).join('');
    $('announce').textContent = `本次获得：${pendingResults.map(r => `${r.rarity}星${data.cards[r.id].name}${r.isWish ? '（心仪武将）' : ''}`).join('、')}。结果已记录。`;
    pendingResults = [];
  }

  function recruit(count) {
    if (busy) return;
    try {
      const next = structuredClone(state);
      const results = engine.draw(next, pool, data.cards, count);
      state = next;
      busy = true;
      save();
      pendingResults = results;
      queue = results.filter(r => r.rarity === 5);
      if (queue.length && !prefs.fast && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        $('announce').textContent = '五星武将即将揭晓…';
        showNextReveal();
      } else { queue = []; busy = false; revealResults(); }
      update();
    } catch (e) {
      busy = false;
      $('announce').textContent = `本次未能招募：${e.message}`;
      update();
    }
  }

  try {
    const response = await fetch('./stzb-draw-assets/pools.json');
    if (!response.ok) throw new Error('卡包资料暂时无法载入');
    data = await response.json();
    if (!data.pools?.length || !data.cards || !engine) throw new Error('卡包资料不完整');
    for (const p of data.pools) {
      if (!p.roster[5]?.length || !data.cards[p.cover]?.portrait) throw new Error('卡包画像资料缺失');
      for (const [r, ids] of Object.entries(p.roster)) if (ids.some(id => data.cards[id]?.rarity !== Number(r))) throw new Error('卡包武将星级不匹配');
    }
    let cached;
    try { cached = JSON.parse(localStorage.getItem(key)); } catch { cached = null; }
    state = cached?.dataVersion === data.version ? engine.restore(cached.state, data.pools, data.cards) : engine.createState();
    if (cached?.prefs) prefs = { poolId: String(cached.prefs.poolId), fast: cached.prefs.fast === true };
    pool = data.pools.find(p => p.id === prefs.poolId) || data.pools[0];
    category = pool.category;
    $('skip-animation').checked = prefs.fast;
    $('method-sources').innerHTML = sourceLinks(data.sources);
    renderPool();
    $('app').hidden = false;
    $('load-status').hidden = true;
    save();
  } catch (e) {
    $('load-status').innerHTML = `${escape(e.message)}。<a href="./stzb-draw.html">重新载入</a>`;
    $('open-method').disabled = true;
    return;
  }

  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('open-method').addEventListener('click', () => $('method-dialog').showModal());
  $('open-roster').addEventListener('click', openRoster);
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    if (busy) return;
    category = button.dataset.category;
    renderPoolList();
  }));
  $('pool-list').addEventListener('click', e => {
    const button = e.target.closest('[data-pool]');
    if (!button || busy) return;
    pool = data.pools.find(p => p.id === button.dataset.pool);
    prefs.poolId = pool.id;
    $('last-results').innerHTML = '<div class="awaiting"><span aria-hidden="true">✦</span><p>虚席以待，静候来仪。</p><small>招募结果将在这里展开</small></div>';
    $('announce').textContent = '';
    renderPool(); save();
  });
  $('select-wish').addEventListener('click', () => {
    $('picker-title').textContent = pool.wishCap ? '选择心愿武将' : '选择收藏目标';
    $('picker-note').textContent = pool.wishCap ? `${pool.wishGroup === 'factions' ? '四阵营共用一个心愿。' : ''}更换后保留 50% 积分；本页使用二次曲线近似心愿概率提升。` : '此活动包无已核实的官方心愿机制。选择只记录目标命中，不改变抽取概率。';
    $('wish-search').value = ''; renderPicker(); $('picker').showModal();
  });
  $('wish-search').addEventListener('input', renderPicker);
  $('wish-grid').addEventListener('click', e => {
    const button = e.target.closest('[data-wish]');
    if (!button) return;
    const id = button.dataset.wish;
    const { wish } = engine.context(state, pool);
    const action = () => { engine.chooseWish(state, pool, id, eligible()); update(); save(); };
    $('picker').close();
    if (wish.id && wish.id !== id && wish.points) confirmAction('更换心愿武将', `当前 ${format(wish.points)} 积分将保留 ${format(Math.floor(wish.points / 2))} 积分。`, action);
    else action();
  });
  $('confirm-accept').addEventListener('click', () => { const action = pendingConfirmation; pendingConfirmation = null; $('confirm-dialog').close(); action?.(); });
  $('confirm-dialog').addEventListener('close', () => { pendingConfirmation = null; });
  $('draw-one').addEventListener('click', () => recruit(1));
  $('draw-five').addEventListener('click', () => recruit(5));
  $('skip-animation').addEventListener('change', () => { prefs.fast = $('skip-animation').checked; save(); });
  $('next-reveal').addEventListener('click', showNextReveal);
  $('skip-reveal').addEventListener('click', () => $('reveal').close());
  $('reveal').addEventListener('close', () => {
    stopIntro();
    $('reveal-intro').hidden = true;
    $('reveal').classList.remove('playing-intro');
    queue = []; busy = false; revealResults(); update();
  });
  document.querySelectorAll('[data-record]').forEach(button => button.addEventListener('click', () => { recordView = button.dataset.record; renderRecords(); }));
  $('restart-event').addEventListener('click', () => confirmAction('重新开始本轮活动', '本包次数恢复为 0，重新获得本轮免费与半价机会；累计消耗、收藏和历史记录保留。', () => {
    delete state.pools[pool.id]; delete state.pity[pool.id];
    update(); save(); $('announce').textContent = '新一轮活动已开启。';
  }));
  $('reset-all').addEventListener('click', () => confirmAction('清空模拟记录', '将清空全部卡包的招募次数、心愿积分、收藏与历史记录。', () => {
    state = engine.createState(); update(); save();
    $('last-results').innerHTML = '<div class="awaiting"><span aria-hidden="true">✦</span><p>新的招募手记，等待落笔。</p></div>';
    $('announce').textContent = '模拟记录已清空。';
  }));
})();
