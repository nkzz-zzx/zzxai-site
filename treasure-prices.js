import {filterWeapons, discountedPrice, formatPrice, heroLabel} from './treasure-prices-core.js';

const $ = id => document.getElementById(id);
const controls = ['price-search','weapon-select','quality-select','main-type-select','max-price','reset-filters'];
let catalog;
const preferredWeapon = new URLSearchParams(location.search).get('weapon');
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function criteria() {
  return {search:$('price-search').value,quality:$('quality-select').value,mainType:$('main-type-select').value,maxPrice:$('max-price').value};
}
function renderBase(weapon) {
  $('weapon-title').textContent = weapon.name;
  $('weapon-category').textContent = weapon.category;
  $('weapon-art').src = `./account-assets/gear-images/${encodeURIComponent(weapon.id)}.jpg`;
  $('weapon-art').alt = weapon.name;
  $('base-features').replaceChildren(...weapon.baseFeatures.map(item => {
    const row = node('li');
    row.append(node('strong',item.name),node('p',item.description));
    return row;
  }));
  $('weapon-details').hidden = false;
}
function renderFeature({feature,tiers,heroes}) {
  const card = node('article',undefined,'feature-card');
  card.dataset.feature = feature.name;
  const heading = node('div',undefined,'feature-heading');
  heading.append(node('h3',feature.name));
  const types = node('div',undefined,'main-types');
  [...new Set(heroes.map(hero => hero.mainSkill.type))].forEach(type => types.append(node('span',type,'type-tag')));
  heading.append(types);
  card.append(heading,node('p',tiers[0].description,'effect'));
  if (feature.note) card.append(node('p',feature.note,'rule-note'));
  const table = node('table');
  table.setAttribute('aria-label',`${feature.name}价格`);
  const thead = node('thead'), header = node('tr');
  ['档位','价格'].forEach(text => {const th=node('th',text);th.scope='col';header.append(th);});
  thead.append(header);
  const body = node('tbody');
  for (const tier of tiers) {
    const row = node('tr');
    row.dataset.quality = tier.quality;
    const value = node('td'), tag = node('span',`${tier.quality}武`,tier.quality === '红' ? 'quality-tag quality-red' : 'quality-tag quality-pink');
    value.append(tag,document.createTextNode(tier.value));
    value.title = tier.description;
    row.append(value,node('td',formatPrice(discountedPrice(tier.referencePrice)),'price-value'));
    body.append(row);
  }
  table.append(thead,body);card.append(table);
  if (heroes.length) {
    const details = node('details',undefined,'adaptations');
    details.open = true;
    details.append(node('summary',`适配武将 · ${heroes.length}`));
    const list = node('div',undefined,'hero-list');
    heroes.forEach(hero => {
      const item = node('div',undefined,'hero-item');
      item.dataset.heroId = hero.id;
      item.title = heroLabel(hero);
      item.append(node('span',hero.name,'hero-name'),node('span',[hero.country,hero.troop,hero.version === '常规' ? '' : hero.version].filter(Boolean).join(' · '),'hero-meta'),node('span',`${hero.mainSkill.type} · ${hero.mainSkill.name}`,'hero-skill'));
      list.append(item);
    });
    details.append(list);card.append(details);
  } else card.append(node('p','参考页暂无适配武将','no-heroes'));
  return card;
}
function render(rebuildOptions=true) {
  if (!catalog) return;
  const results = filterWeapons(catalog, criteria());
  const selectedId = $('weapon-select').value || preferredWeapon;
  if (rebuildOptions) {
    $('weapon-select').replaceChildren(...results.map(({weapon}) => {
      const option = node('option',weapon.name);option.value=weapon.id;return option;
    }));
    $('weapon-select').disabled = !results.length;
    $('weapon-select').value = results.some(({weapon})=>weapon.id === selectedId) ? selectedId : (results[0]?.weapon.id || '');
  }
  const selected = results.find(({weapon}) => weapon.id === $('weapon-select').value);
  $('price-empty').hidden = Boolean(selected);
  $('weapon-details').hidden = !selected;
  $('price-results').replaceChildren(...(selected ? selected.features.map(renderFeature) : []));
  $('result-count').textContent = selected ? `${results.length} 种宝物 · ${selected.features.length} 个词条` : '0 个结果';
  if (selected) {
    renderBase(selected.weapon);
    const url = new URL(location.href);url.searchParams.set('weapon',selected.weapon.id);
    history.replaceState(null,'',url);
  }
}
async function load() {
  controls.forEach(id => $(id).disabled = true);
  $('retry-load').hidden = true;
  $('price-status').classList.remove('error');
  $('price-status').textContent = '正在载入宝物价格…';
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),15000);
  try {
    const response = await fetch('./treasure-assets/prices.json', {signal:controller.signal,cache:'no-cache'});
    if (!response.ok) throw new Error('价格文件暂时无法载入');
    const data = await response.json();
    if (!Array.isArray(data.weapons) || !data.weapons.length || !data.heroes) throw new Error('价格数据不完整');
    catalog = data;
    controls.forEach(id => $(id).disabled = false);
    $('weapon-select').replaceChildren();
    $('price-status').textContent = `${data.weapons.length} 种宝物 · 更新于 ${data.asOf}`;
    render();
  } catch (error) {
    $('price-status').classList.add('error');
    $('price-status').textContent = error.name === 'AbortError' ? '载入超时，请重新载入。' : '宝物价格载入失败，请重新载入。';
    $('retry-load').hidden = false;
  } finally { clearTimeout(timer); }
}
for (const id of ['price-search','max-price']) $(id).addEventListener('input',()=>render());
for (const id of ['quality-select','main-type-select']) $(id).addEventListener('change',()=>render());
$('weapon-select').addEventListener('change',()=>render(false));
$('reset-filters').addEventListener('click',()=>{
  $('price-search').value='';$('quality-select').value='all';$('main-type-select').value='all';$('max-price').value='';render();
});
$('retry-load').addEventListener('click',load);
load();
