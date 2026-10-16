import {filterTeams, getMatchups, heroLabel} from './team-counters-core.js?v=20261016-1';

const $ = id => document.getElementById(id);
const resultNames = {advantage: '克制', disadvantage: '被克制', balanced: '接近', disputed: '有分歧'};
let catalog, currentTeam, currentVariant, relationFilter = 'all', noticeTimer;
const savedVariants = new Map();
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function portrait(hero, lazy = true) {
  const img = element('img');
  img.src = hero.thumbnail;
  img.alt = heroLabel(hero);
  img.width = 30; img.height = 40;
  img.loading = lazy ? 'lazy' : 'eager'; img.decoding = 'async';
  return img;
}
function triptych(variant) {
  const node = element('span', 'triptych');
  node.setAttribute('aria-hidden', 'true');
  for (const member of variant.members) node.append(portrait(catalog.heroes[member.heroId]));
  return node;
}
function sourceLink(evidence, result) {
  const source = catalog.sources[evidence.source];
  const item = element('div', 'source-item');
  const link = element('a', '', `${source.author} · ${source.title}`);
  link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  item.append(link, element('div', '', [source.date, evidence.locator, result && `本队视角：${resultNames[result]}`].filter(Boolean).join(' · ')));
  return item;
}
function filteredTeams() {
  return filterTeams(catalog, {search: $('team-search').value, category: $('category').value});
}
function updateURL(replace = false) {
  const url = new URL(location.href);
  url.searchParams.set('team', currentTeam.id); url.searchParams.set('variant', currentVariant.id);
  if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState']({}, '', url);
}
function renderTeamList() {
  const teams = filteredTeams();
  $('team-count').textContent = teams.length;
  $('search-empty').hidden = !!teams.length;
  const fragment = document.createDocumentFragment();
  for (const team of teams) {
    const button = element('button', 'team-button');
    button.type = 'button'; button.dataset.teamId = team.id; button.id = `team-tab-${team.id}`;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'team-details');
    const selected = team.id === currentTeam?.id;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    const copy = element('span', 'team-copy');
    copy.append(element('strong', '', team.name), element('small', '', `${team.category} · ${team.variants.length} 套`));
    button.append(triptych(catalog.variants[team.variants[0]]), copy);
    fragment.append(button);
  }
  if (!teams.some(t => t.id === currentTeam?.id)) fragment.firstChild?.setAttribute('tabindex', '0');
  $('team-list').replaceChildren(fragment);
}
function renderConfiguration() {
  $('team-title').textContent = currentTeam.name;
  $('variant-count').textContent = `${currentTeam.variants.length} 套战法`;
  $('team-details').setAttribute('aria-labelledby', `team-tab-${currentTeam.id}`);
  const tabs = document.createDocumentFragment();
  for (const id of currentTeam.variants) {
    const variant = catalog.variants[id];
    const button = element('button', '', variant.label);
    button.type = 'button'; button.dataset.variantId = id; button.id = `variant-tab-${id}`;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'configuration');
    button.setAttribute('aria-selected', String(id === currentVariant.id)); button.tabIndex = id === currentVariant.id ? 0 : -1;
    tabs.append(button);
  }
  $('variant-tabs').replaceChildren(tabs);
  $('configuration').setAttribute('aria-labelledby', `variant-tab-${currentVariant.id}`);
  const members = document.createDocumentFragment();
  currentVariant.members.forEach((member, index) => {
    const hero = catalog.heroes[member.heroId];
    const card = element('div', 'member'); card.dataset.heroId = hero.id;
    const heading = element('div', 'member-heading'), meta = element('div', 'member-meta');
    meta.append(element('span', 'position', ['大营', '中军', '前锋'][index]), element('strong', 'member-name', hero.name), element('span', 'hero-version', [hero.country, hero.troop, hero.version === '常规' ? '' : hero.version].filter(Boolean).join(' · ')));
    heading.append(portrait(hero, false), meta);
    const skills = element('div', 'member-skills');
    for (const id of member.skills) {
      const skill = catalog.skills[id];
      skills.append(element('div', `skill ${skill.kind || ''}`, skill.name));
    }
    card.append(heading, skills); members.append(card);
  });
  $('members').replaceChildren(members);
  $('variant-notes').replaceChildren(...currentVariant.notes.map(note => element('p', '', note)));
  $('configuration-sources').replaceChildren(...currentVariant.evidence.map(evidence => sourceLink(evidence)));
  $('configuration').querySelector('details').open = false;
}
function matchupCard(matchup) {
  const team = catalog.teams.find(team => team.id === matchup.teamId);
  const variant = catalog.variants[matchup.variantId || team.variants[0]];
  const card = element('article', 'matchup-card'); card.dataset.opponentTeam = team.id;
  const button = element('button', 'matchup-main'); button.type = 'button';
  button.dataset.openTeam = team.id; button.dataset.openVariant = variant.id;
  button.setAttribute('aria-label', `查看${team.name} · ${variant.label}`);
  const copy = element('span', 'team-copy'), title = element('strong', '', team.name);
  if (matchup.scope === 'archetype') title.append(element('span', 'reference-badge', '队伍参考'));
  copy.append(title, element('small', '', matchup.variantId ? variant.label : '未限定对方战法'));
  button.append(triptych(variant), copy, element('span', 'arrow', '›'));
  const details = element('details', 'source-details');
  details.append(element('summary', '', matchup.result === 'disputed' ? '查看分歧依据' : '依据'));
  if (matchup.scope === 'archetype') details.append(element('p', 'evidence-note', '来源按队伍体系讨论，对方画像用于识别队伍，不代表验证了其全部战法方案。'));
  const seen = new Set();
  for (const evidence of matchup.evidence) {
    const key = `${evidence.source}:${evidence.locator}:${evidence.viewedResult}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (evidence.note) details.append(element('p', 'evidence-note', evidence.note));
    details.append(sourceLink(evidence, evidence.viewedResult));
  }
  card.append(button, details); return card;
}
function renderMatchups() {
  const matchups = getMatchups(catalog, currentVariant.id);
  for (const button of $('relation-filters').querySelectorAll('button')) {
    const type = button.dataset.result;
    const count = type === 'all' ? matchups.length : matchups.filter(item => item.result === type).length;
    button.textContent = `${type === 'all' ? '全部' : resultNames[type]} ${count}`;
    button.setAttribute('aria-pressed', String(relationFilter === type));
  }
  const fragment = document.createDocumentFragment();
  let displayed = 0;
  for (const [result, name] of Object.entries(resultNames)) {
    if (relationFilter !== 'all' && relationFilter !== result) continue;
    const items = matchups.filter(item => item.result === result);
    if (!items.length) continue;
    displayed += items.length;
    const section = element('section', 'matchup-section'); section.dataset.result = result;
    const title = element('h4', '', name); title.append(element('span', '', items.length));
    const grid = element('div', 'matchup-grid'); grid.append(...items.map(matchupCard));
    section.append(title, grid); fragment.append(section);
  }
  if (!displayed) fragment.append(element('p', 'empty', matchups.length ? '暂无此类对局记录' : '此方案尚无可核对的对局关系，未沿用其他战法方案。'));
  $('matchups').replaceChildren(fragment);
}
function selectTeam(teamId, variantId, replace = false, keepFilter = false) {
  currentTeam = catalog.teams.find(team => team.id === teamId) || catalog.teams.find(team => team.id === 'chengyu') || catalog.teams[0];
  const preferred = variantId || savedVariants.get(currentTeam.id);
  currentVariant = catalog.variants[currentTeam.variants.includes(preferred) ? preferred : currentTeam.variants[0]];
  savedVariants.set(currentTeam.id, currentVariant.id);
  if (!keepFilter) relationFilter = 'all';
  $('team-details').hidden = false;
  renderTeamList(); renderConfiguration(); renderMatchups(); updateURL(replace);
  $('team-details').querySelector('.detail-body').scrollTop = 0;
  $('variant-tabs').querySelector('[aria-selected=true]')?.scrollIntoView({block: 'nearest', inline: 'nearest'});
}
function notice(text) {
  clearTimeout(noticeTimer); $('notice').textContent = text; $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 4000);
}
async function load() {
  $('retry-load').hidden = true; $('status').textContent = '加载队伍…';
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('./team-assets/catalog.json?v=20261016-1', {signal: controller.signal});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (data.schemaVersion !== 1 || !data.teams?.length || !data.variants || !data.observations || !data.heroes || !data.skills || !data.sources) throw new Error('Invalid catalog');
    catalog = data;
    $('category').replaceChildren(element('option', '', '全部队伍'), ...[...new Set(catalog.teams.map(t => t.category))].map(category => {const option = element('option', '', category); option.value = category; return option;}));
    $('category').firstChild.value = 'all';
    $('team-search').disabled = false; $('category').disabled = false;
    const params = new URL(location.href).searchParams;
    selectTeam(params.get('team'), params.get('variant'), true);
    $('team-list').querySelector('[aria-selected=true]')?.scrollIntoView({block: 'nearest'});
    $('load-status').hidden = true;
  } catch (error) {
    $('team-details').hidden = true; $('load-status').hidden = false;
    $('status').textContent = '队伍载入失败，请重试。'; $('retry-load').hidden = false;
  } finally {clearTimeout(timer);}
}
$('team-list').addEventListener('click', event => {
  const button = event.target.closest('[data-team-id]');
  if (button) selectTeam(button.dataset.teamId);
});
$('variant-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-variant-id]');
  if (button) selectTeam(currentTeam.id, button.dataset.variantId);
});
$('matchups').addEventListener('click', event => {
  const button = event.target.closest('[data-open-team]');
  if (!button) return;
  $('team-search').value = ''; $('category').value = 'all';
  selectTeam(button.dataset.openTeam, button.dataset.openVariant);
  $('team-list').querySelector('[aria-selected=true]')?.scrollIntoView({block: 'nearest'});
});
function onFilter() {
  const teams = filteredTeams(); renderTeamList();
  if (!teams.length) {$('team-details').hidden = true; return;}
  if (!teams.some(team => team.id === currentTeam?.id)) selectTeam(teams[0].id);
  else $('team-details').hidden = false;
}
$('team-search').addEventListener('input', onFilter); $('category').addEventListener('change', onFilter);
$('relation-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-result]');
  if (button) {relationFilter = button.dataset.result; renderMatchups();}
});
function tabKeys(event, container, selector, vertical, activate) {
  const buttons = [...container.querySelectorAll(selector)], index = buttons.indexOf(document.activeElement);
  const nextKey = vertical ? 'ArrowDown' : 'ArrowRight', previousKey = vertical ? 'ArrowUp' : 'ArrowLeft';
  if (index < 0 || ![nextKey, previousKey, 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === nextKey ? 1 : -1) + buttons.length) % buttons.length;
  const id = activate(buttons[next]);
  document.getElementById(id)?.focus({preventScroll: true}); document.getElementById(id)?.scrollIntoView({block: 'nearest', inline: 'nearest'});
}
$('team-list').addEventListener('keydown', event => tabKeys(event, $('team-list'), '[data-team-id]', true, button => {selectTeam(button.dataset.teamId); return button.id;}));
$('variant-tabs').addEventListener('keydown', event => tabKeys(event, $('variant-tabs'), '[data-variant-id]', false, button => {selectTeam(currentTeam.id, button.dataset.variantId); return button.id;}));
$('copy-link').addEventListener('click', async () => {
  try {await navigator.clipboard.writeText(location.href); notice('方案链接已复制');}
  catch {notice('复制浏览器地址即可分享当前方案');}
});
$('retry-load').addEventListener('click', load);
window.addEventListener('popstate', () => {
  if (!catalog) return;
  $('team-search').value = ''; $('category').value = 'all';
  const params = new URL(location.href).searchParams;
  selectTeam(params.get('team'), params.get('variant'), true);
});
load();
