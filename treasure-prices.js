import {filterWeapons, discountedPrice, formatPrice, heroLabel} from './treasure-prices-core.js?v=20261102-price-90-v1';

const $ = id => document.getElementById(id);
const controls = ['price-search','quality-select','main-type-select','max-price','reset-filters'];
const params = new URLSearchParams(location.search);
let catalog, results = [], selectedWeaponId = params.get('weapon') || '', selectedFeatureName = params.get('feature') || '';
let skillTrigger = null;
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function criteria() {
  return {search:$('price-search').value,quality:$('quality-select').value,mainType:$('main-type-select').value,maxPrice:$('max-price').value};
}
function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set('weapon',selectedWeaponId);
  url.searchParams.set('feature',selectedFeatureName);
  history.replaceState(null,'',url);
}
function renderWeapons() {
  const list = $('weapon-list'), scrollTop = list.scrollTop;
  const focusedId = document.activeElement?.dataset.weaponId;
  list.replaceChildren(...results.map(({weapon,features},index) => {
    const button = node('button',undefined,'arm-button');
    button.type = 'button';button.dataset.weaponId = weapon.id;button.id = `weapon-${weapon.id}`;
    button.setAttribute('role','tab');button.setAttribute('aria-label',weapon.name);
    button.setAttribute('aria-controls','weapon-details');
    button.setAttribute('aria-selected',String(weapon.id === selectedWeaponId));
    button.tabIndex = weapon.id === selectedWeaponId ? 0 : -1;
    const image = node('img');image.src = `./account-assets/gear-images/${encodeURIComponent(weapon.id)}.jpg`;image.alt = '';image.width=42;image.height=42;image.loading=index<10?'eager':'lazy';image.decoding='async';
    const text = node('span');text.append(node('strong',weapon.name),node('small',`${features.reduce((n,f)=>n+f.tiers.length,0)} 档`));
    button.append(image,text);return button;
  }));
  list.scrollTop = scrollTop;
  if (focusedId) list.querySelector(`[data-weapon-id="${CSS.escape(focusedId)}"]`)?.focus({preventScroll:true});
  $('weapon-count').textContent = String(results.length);
}
function renderBase(weapon) {
  $('weapon-title').textContent = weapon.name;
  $('weapon-category').textContent = weapon.category;
  $('weapon-art').src = `./account-assets/gear-images/${encodeURIComponent(weapon.id)}.jpg`;
  $('weapon-art').alt = weapon.name;
  $('base-features').replaceChildren(...weapon.baseFeatures.map(item => {
    const row = node('li');row.append(node('strong',item.name),node('p',item.description));return row;
  }));
}
function renderTabs(features) {
  const focusedFeature = document.activeElement?.dataset.feature;
  $('feature-tabs').replaceChildren(...features.map(({feature},index) => {
    const button = node('button',feature.name,'feature-tab');button.type='button';button.id=`feature-tab-${index}`;button.dataset.feature=feature.name;
    button.setAttribute('role','tab');button.setAttribute('aria-controls','price-results');
    button.setAttribute('aria-selected',String(feature.name === selectedFeatureName));button.tabIndex=feature.name===selectedFeatureName?0:-1;
    return button;
  }));
  $('feature-count').textContent = `${features.length} 项`;
  if (focusedFeature) $('feature-tabs').querySelector(`[data-feature="${CSS.escape(focusedFeature)}"]`)?.focus({preventScroll:true});
}
function renderPrices({feature,tiers,heroes}) {
  const panel = $('price-results');panel.dataset.feature=feature.name;
  panel.setAttribute('aria-label',`${feature.name}价格`);
  panel.setAttribute('aria-labelledby',$('feature-tabs').querySelector('[aria-selected="true"]').id);
  panel.replaceChildren(...tiers.map(tier => {
    const row = node('div',undefined,`value-option ${tier.quality==='粉'?'fen':'hong'}`);row.dataset.quality=tier.quality;
    const button = node('button',undefined,'value-main');button.type='button';button.setAttribute('aria-expanded','false');
    const info = node('span',undefined,'tier-info'), heading = node('span',undefined,'tier-heading');
    heading.append(node('strong',tier.value,'tier-value'),node('small',`${tier.quality}武`,'quality-tag'));
    info.append(heading,node('span',tier.description,'tier-effect'));
    button.append(info,node('b',formatPrice(discountedPrice(tier.referencePrice)),'price-value'));
    row.append(button);return row;
  }));
  $('hero-grid').replaceChildren(...heroes.map(hero => {
    const item = node('button',undefined,'hero-item');item.type='button';item.dataset.heroId=hero.id;item.title=heroLabel(hero);
    item.setAttribute('aria-haspopup','dialog');item.setAttribute('aria-controls','hero-skill-dialog');
    item.setAttribute('aria-label',`查看${heroLabel(hero)}的主战法${hero.mainSkill.name}详情`);
    const image = node('img');image.className='hero-art';image.src=hero.portrait;image.alt=heroLabel(hero);image.loading='lazy';image.decoding='async';image.width=90;image.height=120;
    const prefix = ['S2','S3','XP','SP'].includes(hero.version)?hero.version:'';
    const text = node('span');text.append(node('span',prefix+hero.name,'hero-name'),node('span',[hero.country,hero.troop].filter(Boolean).join(' · '),'hero-meta'),node('span',`${hero.mainSkill.type} · ${hero.mainSkill.name}`,'hero-skill'));
    item.append(image,text);return item;
  }));
  $('hero-count').textContent=String(heroes.length);$('adapt-heroes').hidden=!heroes.length;
}
function render() {
  if (!catalog) return;
  results = filterWeapons(catalog,criteria());
  const selected = results.find(({weapon})=>weapon.id===selectedWeaponId) || results[0];
  if (selected) {
    selectedWeaponId=selected.weapon.id;
    const feature = selected.features.find(({feature})=>feature.name===selectedFeatureName) || selected.features[0];
    selectedFeatureName=feature.feature.name;
    renderBase(selected.weapon);renderTabs(selected.features);renderPrices(feature);syncUrl();
  } else {
    $('feature-tabs').replaceChildren();$('price-results').replaceChildren();$('hero-grid').replaceChildren();
  }
  renderWeapons();$('weapon-details').hidden=!selected;$('price-empty').hidden=Boolean(selected);
}
function selectWeapon(id, focus=false) {
  selectedWeaponId=id;render();$('weapon-details').scrollTop=0;
  if (focus) { const button=$('weapon-list').querySelector('[aria-selected="true"]');button?.focus({preventScroll:true});button?.scrollIntoView({block:'nearest'}); }
}
function selectFeature(name, focus=false) {
  const selected=results.find(({weapon})=>weapon.id===selectedWeaponId);
  const feature=selected?.features.find(item=>item.feature.name===name);
  if (!feature) return;
  selectedFeatureName=name;renderTabs(selected.features);renderPrices(feature);syncUrl();$('weapon-details').scrollTop=0;
  if (focus) $('feature-tabs').querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
}
function setFilters(open) {
  $('filter-panel').hidden=!open;$('filter-toggle').setAttribute('aria-expanded',String(open));
}
function showHeroSkill(hero, trigger) {
  const skill=hero.mainSkill || {}, dialog=$('hero-skill-dialog');
  skillTrigger=trigger;
  $('skill-hero-art').src=hero.portrait;$('skill-hero-art').alt=heroLabel(hero);
  $('skill-hero-title').textContent=hero.name;
  $('skill-hero-meta').textContent=[hero.country,hero.troop,hero.version==='常规'?'':hero.version].filter(Boolean).join(' · ');
  $('skill-name').textContent=skill.name || '主战法详情';
  $('skill-type').textContent=skill.type || '';$('skill-type').hidden=!skill.type;
  const facts=[];
  for (const [label,value] of [['发动率',skill.probability],['有效距离',skill.distance],['目标',skill.target]]) {
    if (value===undefined || value===null || value==='') continue;
    const fact=node('div',undefined,label==='目标'?'skill-fact-target':'');
    fact.append(node('dt',label),node('dd',String(value)));facts.push(fact);
  }
  $('skill-facts').replaceChildren(...facts);$('skill-facts').hidden=!facts.length;
  const description=typeof skill.description==='string'?skill.description.trim():'';
  $('skill-effect-title').textContent=description&&skill.descriptionLevel===10?'满级效果':'战法效果';
  $('skill-description').textContent=description || '暂未收录该主战法的完整效果。';
  $('skill-description').classList.toggle('is-unavailable',!description);
  setFilters(false);document.body.classList.add('skill-dialog-open');
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.skill-dialog-body').scrollTop=0;
}
async function load() {
  controls.forEach(id=>$(id).disabled=true);$('load-status').hidden=false;$('price-empty').hidden=true;
  $('retry-load').hidden=true;$('price-status').classList.remove('error');$('price-status').textContent='加载中…';
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch('./treasure-assets/prices.json?v=20261102-price-90-v1',{signal:controller.signal,cache:'no-cache'});
    if (!response.ok) throw new Error('载入失败');
    const data=await response.json();
    if (!Array.isArray(data.weapons)||!data.weapons.length||!data.heroes) throw new Error('数据不完整');
    catalog=data;controls.forEach(id=>$(id).disabled=false);render();$('price-status').textContent='';$('load-status').hidden=true;
  } catch (error) {
    $('price-status').classList.add('error');$('price-status').textContent=error.name==='AbortError'?'载入超时，请重新载入。':'宝物价格载入失败，请重新载入。';$('retry-load').hidden=false;
  } finally { clearTimeout(timer); }
}
$('weapon-list').addEventListener('click',event=>{const button=event.target.closest('[data-weapon-id]');if(button)selectWeapon(button.dataset.weaponId);});
$('feature-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-feature]');if(button)selectFeature(button.dataset.feature);});
for (const [id,keys,select] of [['weapon-list',['ArrowUp','ArrowDown'],selectWeapon],['feature-tabs',['ArrowLeft','ArrowRight'],selectFeature]]) {
  $(id).addEventListener('keydown',event=>{
    if (!keys.includes(event.key)&&!['Home','End'].includes(event.key)) return;
    const buttons=[...$(id).querySelectorAll('[role="tab"]')], current=buttons.indexOf(event.target);
    if (current<0) return;event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key===keys[1]?1:-1)+buttons.length)%buttons.length;
    select(id==='weapon-list'?buttons[next].dataset.weaponId:buttons[next].dataset.feature,true);
  });
}
$('price-results').addEventListener('click',event=>{
  const button=event.target.closest('.value-main');if(!button)return;const open=button.getAttribute('aria-expanded')!=='true';
  $('price-results').querySelectorAll('.value-main').forEach(item=>{const expanded=item===button&&open;item.setAttribute('aria-expanded',String(expanded));item.parentElement.classList.toggle('is-expanded',expanded);});
});
$('hero-grid').addEventListener('click',event=>{
  const button=event.target.closest('.hero-item');
  const hero=button&&catalog?.heroes[button.dataset.heroId];
  if (hero) showHeroSkill(hero,button);
});
$('close-hero-skill').addEventListener('click',()=>$('hero-skill-dialog').close());
$('hero-skill-dialog').addEventListener('close',()=>{
  document.body.classList.remove('skill-dialog-open');
  if (skillTrigger?.isConnected) skillTrigger.focus({preventScroll:true});
  skillTrigger=null;
});
let backdropPointerDown=false;
function outsideSkillDialog(event) {
  const bounds=$('hero-skill-dialog').getBoundingClientRect();
  return event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom;
}
$('hero-skill-dialog').addEventListener('pointerdown',event=>{backdropPointerDown=event.target===$('hero-skill-dialog')&&outsideSkillDialog(event);});
$('hero-skill-dialog').addEventListener('click',event=>{
  if (backdropPointerDown && event.target===$('hero-skill-dialog') && outsideSkillDialog(event)) $('hero-skill-dialog').close();
  backdropPointerDown=false;
});
for (const id of ['price-search','max-price']) $(id).addEventListener('input',render);
for (const id of ['quality-select','main-type-select']) $(id).addEventListener('change',render);
$('filter-toggle').addEventListener('click',()=>setFilters($('filter-panel').hidden));
document.addEventListener('click',event=>{if(!$('filter-panel').hidden&&!$('filter-panel').contains(event.target)&&!$('filter-toggle').contains(event.target))setFilters(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('filter-panel').hidden){setFilters(false);$('filter-toggle').focus();}});
$('reset-filters').addEventListener('click',()=>{$('price-search').value='';$('quality-select').value='all';$('main-type-select').value='all';$('max-price').value='';render();});
$('retry-load').addEventListener('click',load);
load();
