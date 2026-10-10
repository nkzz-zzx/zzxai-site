'use strict';

(async function () {
  const $ = selector => document.querySelector(selector);
  const results = $('#results');
  const detail = $('#detail');
  const state = {year:'all',country:'all',status:'all',search:'',changes:false,before:'',xp:'all',limited:'all'};
  let data;
  let returnFocus;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const statusOf = card => !card.first ? 'pending' : card.status === '赛季批次推定' ? 'inferred' : 'confirmed';
  const yearOf = card => card.first ? card.first.slice(0,4) : 'pending';
  const isXp = card => card.version.startsWith('XP') && !card.events.some(event=>event.kind==='XP下放'&&event.date<=data.asOf);
  const versionOf = card => card.limited || (card.version.startsWith('XP')&&!isXp(card) ? '已下放 · 原 XP' : card.version === '常规版' ? '常规武将' : card.version === 'SP／旧赛季限定' ? 'SP' : card.version);
  const formatDate = date => date.replaceAll('-','.');
  const sourceLinks = sources => `<div class="source-links">${sources.map((url,i) => `<a href="${escape(url)}" target="_blank" rel="noopener">${i ? '补充来源 '+i : '查看来源'} ↗</a>`).join('')}</div>`;
  const portrait = (card, lazy = true) => card.portrait
    ? `<img src="${escape(card.portrait)}" alt="${escape(card.country+'·'+card.name+'（'+versionOf(card)+'）官方画像')}" width="240" height="348" ${lazy?'loading="lazy"':''} decoding="async">`
    : `<div class="no-portrait"><strong>${escape(card.name)}</strong><span>官方画像待补</span></div>`;

  function matches(card) {
    const query=state.search.trim().toLocaleLowerCase().replaceAll(' ','');
    const searchText=[card.name,card.country,card.troop,card.version,versionOf(card)].join('').toLocaleLowerCase().replaceAll(' ','');
    return (state.year==='all'||yearOf(card)===state.year) &&
      (state.country==='all'||card.country===state.country) &&
      (state.status==='all'||statusOf(card)===state.status) &&
      (state.xp==='all'||isXp(card)===(state.xp==='yes')) &&
      (state.limited==='all'||Boolean(card.limited)===(state.limited==='yes')) &&
      (!state.before||(card.first&&card.first<state.before)) &&
      (!state.changes||card.events.length>0) && (!query||searchText.includes(query));
  }

  function render() {
    if(!data)return;
    const selected=data.cards.filter(matches).sort((a,b)=>(b.first||'').localeCompare(a.first||'')||a.name.localeCompare(b.name,'zh-CN'));
    const filtered=state.year!=='all'||state.country!=='all'||state.status!=='all'||state.search.trim()||state.changes||state.before||state.xp!=='all'||state.limited!=='all';
    $('#result-count').textContent=`${filtered?'筛选结果':'全部武将'} · ${selected.length} 张卡${state.year==='pending'?' · 首发日期待核实':''}`;
    $('#reset').hidden=!filtered;
    $('#clear-search').hidden=!state.search;
    $('#date-note').hidden=!state.before;
    document.querySelectorAll('[data-year]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.year===state.year)));
    document.querySelectorAll('[data-country]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.country===state.country)));
    for(const key of ['xp','limited'])document.querySelectorAll(`[data-${key}]`).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset[key]===state[key])));
    if(!selected.length){
      results.innerHTML='<div class="empty"><h2>没有找到符合条件的武将</h2><p>试试其他名称，或清除年份、阵营等筛选条件。</p><button class="reset" data-reset>清除全部筛选</button></div>';
      return;
    }
    const groups=new Map();
    selected.forEach(card=>{const year=yearOf(card);if(!groups.has(year))groups.set(year,[]);groups.get(year).push(card);});
    results.innerHTML=[...groups].map(([year,cards])=>`<section class="year-group" aria-labelledby="year-${year}"><div class="year-heading"><h2 id="year-${year}">${year==='pending'?'首发待考':year}</h2><small>${cards.length} 张${year==='pending'?' · 先保留已知记录':' · 首次上架'}</small><span class="year-rule" aria-hidden="true"></span></div><div class="card-grid">${cards.map(card=>{
      const status=statusOf(card);
      const mark=card.events.some(e=>['同名新版上架','调整后重新上架','原卡战法重做'].includes(e.kind))?'重做 / 新版':card.events.length?'版本记录':'';
      return `<button class="general" data-card="${escape(card.id)}" aria-label="查看${escape(card.country+'·'+card.name+'·'+versionOf(card))}详情"><div class="portrait">${portrait(card)}<span class="faction" aria-hidden="true">${escape(card.country)}</span><span class="version">${escape(versionOf(card))}</span>${mark?`<span class="change-mark">${mark}</span>`:''}</div><div class="card-body"><div class="name-line"><h3>${escape(card.name)}</h3><span class="troop">${escape(card.troop?card.troop+'兵':'')}</span></div><div class="date-line">${card.first?`<time datetime="${card.first}">${formatDate(card.first)}</time>`:'<span>首发日期待核实</span>'}${status==='inferred'?'<span class="uncertain">· 推定</span>':''}</div></div></button>`;
    }).join('')}</div></section>`).join('');
  }

  function reset() {
    Object.assign(state,{year:'all',country:'all',status:'all',search:'',changes:false,before:'',xp:'all',limited:'all'});
    $('#search').value='';$('#status').value='all';$('#has-changes').checked=false;
    $('#before').value='';
    render();
  }

  function openCard(id, trigger) {
    const card=data.cards.find(c=>c.id===id);
    if(!card)return;
    if(trigger)returnFocus=trigger;
    const events=[...(card.first?[{date:card.first,kind:'首次上架',status:card.status,note:card.note,sources:card.sources}]:[]),...card.events]
      .sort((a,b)=>a.date.localeCompare(b.date));
    const related=data.cards.find(c=>c.id===card.related);
    $('#detail-content').innerHTML=`<div class="detail-grid"><div class="detail-art">${portrait(card,false)}</div><div class="detail-text"><p class="detail-eyebrow">${escape(card.country)} · ${escape(card.troop?card.troop+'兵':'兵种待核')} · ${escape(versionOf(card))}</p><h2 id="detail-name">${escape(card.name)}</h2><div class="detail-facts"><div><span>常规服首次上架</span><strong>${card.first?formatDate(card.first):'待核实'}</strong></div><div><span>日期依据</span><strong>${escape(card.status)}</strong></div><div><span>当前分类</span><strong>${isXp(card)?'XP':'非 XP'} · ${escape(card.limited||'非限定')}</strong></div></div>${card.limited?`<div class="classification-source"><span>限定分类依据</span>${sourceLinks(card.limitedSources)}</div>`:''}${!card.first?`<p class="detail-note">${escape(card.period)}。${escape(card.note)}</p>${sourceLinks(card.sources)}`:card.status==='赛季批次推定'?'<p class="detail-note">该日期依据赛季批次推定，尚未确认逐卡当天可获取的证据。</p>':''}<h3>登场与版本记录</h3>${events.length?`<ol class="event-list">${events.map(event=>`<li><time class="event-date" datetime="${event.date}">${formatDate(event.date)}</time><h4>${escape(event.kind)}${event.status==='赛季批次推定'?' · 批次推定':''}</h4>${event.note?`<p>${escape(event.note)}</p>`:''}${sourceLinks(event.sources)}</li>`).join('')}</ol>`:'<p class="detail-note">首次上架日期仍待核实。</p>'}<div class="detail-links">${related?`<button data-related="${escape(related.id)}">查看${escape(related.version.includes('旧')?'旧版':'新版')}${escape(related.name)} →</button>`:''}${card.officialPage?`<a href="${escape(card.officialPage)}" target="_blank" rel="noopener">官方武将详情 ↗</a>`:''}${card.portraitSource?`<a href="${escape(card.portraitSource)}" target="_blank" rel="noopener">官方原图 ↗</a>`:''}</div></div></div>`;
    if(!detail.open)detail.showModal();
    detail.scrollTop=0;
    document.body.classList.add('dialog-open');
    $('#close-detail').focus({preventScroll:true});
  }

  $('#close-detail').addEventListener('click',()=>detail.close());
  detail.addEventListener('click',event=>{if(event.target===detail){const box=detail.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)detail.close();}});
  detail.addEventListener('close',()=>{document.body.classList.remove('dialog-open');returnFocus?.focus({preventScroll:true});});
  $('#detail-content').addEventListener('click',event=>{const related=event.target.closest('[data-related]');if(related)openCard(related.dataset.related);});
  $('#reset').addEventListener('click',reset);
  results.addEventListener('click',event=>{const card=event.target.closest('[data-card]');if(card)openCard(card.dataset.card,card);if(event.target.closest('[data-reset]'))reset();});
  $('#search').addEventListener('input',event=>{state.search=event.target.value;render();});
  $('#clear-search').addEventListener('click',()=>{state.search='';$('#search').value='';render();$('#search').focus();});
  $('#status').addEventListener('change',event=>{state.status=event.target.value;render();});
  $('#has-changes').addEventListener('change',event=>{state.changes=event.target.checked;render();});
  $('#before').addEventListener('input',event=>{state.before=event.target.value;render();});
  for(const key of ['xp','limited'])$('#'+key+'-filter').addEventListener('click',event=>{const button=event.target.closest(`[data-${key}]`);if(button){state[key]=button.dataset[key];render();}});
  $('#countries').addEventListener('click',event=>{const button=event.target.closest('[data-country]');if(button){state.country=button.dataset.country;render();}});
  $('#year-list').addEventListener('click',event=>{const button=event.target.closest('[data-year]');if(button){state.year=button.dataset.year;render();}});
  try {
    const response=await fetch('./stzb-assets/timeline.json');
    if(!response.ok)throw new Error(`资料请求失败：${response.status}`);
    data=await response.json();
    if(!Array.isArray(data.cards)||!data.cards.length)throw new Error('武将资料为空');
    $('#total').textContent=data.cards.length;
    for(const key of ['confirmed','inferred','pending'])$(('#'+key)).textContent=data.cards.filter(c=>statusOf(c)===key).length;
    const years=[...new Set(data.cards.filter(c=>c.first).map(yearOf))].sort().reverse();
    $('#year-list').innerHTML=[['all','全部年份'],...years.map(year=>[year,year]),['pending','待核实']].map(([year,label])=>`<button data-year="${year}" aria-pressed="${year==='all'}">${label}<span>${year==='all'?data.cards.length:data.cards.filter(c=>yearOf(c)===year).length}</span></button>`).join('');
    render();
  } catch(error) {
    $('#result-count').textContent='资料暂时无法载入';
    results.innerHTML='<div class="error">无法载入武将资料，请刷新页面重试，或下载上方完整表格查看。</div>';
    for(const control of document.querySelectorAll('.filter-top input,.filter-top select,.filter-bottom button,.filter-bottom input,.filter-more input,.filter-more button'))control.disabled=true;
    console.error(error);
  } finally { results.setAttribute('aria-busy','false'); }
})();
