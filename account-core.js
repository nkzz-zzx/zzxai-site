import {serverTable} from './account-server-types.js?v=20261013-servers-v2';
export function parseAccountLink(input) {
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('请输入完整的藏宝阁商品链接'); }
  if (url.protocol !== 'https:' || url.hostname !== 'stzb.cbg.163.com' || url.port || url.username || url.password) throw new Error('仅支持率土之滨藏宝阁的 HTTPS 商品链接');
  const match = url.pathname.match(/^\/cgi\/(?:mweb|web)\/equip\/(\d+)\/([A-Za-z0-9-]+)\/?$/);
  if (!match || match[2].length > 100) throw new Error('无法识别商品链接，请复制商品详情页地址');
  return { serverid: match[1], ordersn: match[2], url: `https://stzb.cbg.163.com/cgi/mweb/equip/${match[1]}/${match[2]}` };
}
export function classifyServer(serverName) {
  const match=String(serverName || '').match(/(?:^|[^A-Za-z0-9])X\s*(\d+)(?!\d)/i);
  const serverNum=match?'X'+match[1].replace(/^0+(?=\d)/,''):'';
  const entry=serverTable.servers.find(row=>row.serverNum===serverNum);
  return {serverNum,accountType:entry?.type||'待核实',accountTypeConfirmed:!!entry,serverTypeTableUpdatedAt:serverTable.updatedAt};
}
const countries = { 1:'汉', 2:'魏', 3:'蜀', 4:'吴', 5:'群', 6:'晋' };
const troops = { 1:'弓', 2:'步', 3:'骑' };
export function normalizeAccount(raw) {
  const equip = raw?.equip;
  if (!equip || !equip.equip_desc) throw new Error('未取得账号详情，商品可能不存在、已下架或需要登录');
  let desc = equip.equip_desc;
  if (typeof desc === 'string') { try { desc = JSON.parse(desc); } catch { throw new Error('账号详情格式无法解析'); } }
  if (!Array.isArray(desc.card) || !Array.isArray(desc.skill)) throw new Error('账号武将或战法数据不完整，无法判断未拥有项');
  const heroes = desc.card.map(c => ({ id: String(c.hero_id), iconId: String(c.icon_hero_id ?? c.hero_id), name:c.name, country:countries[c.country] || String(c.country), troop:troops[c.hero_type] || String(c.hero_type), rarity:Number(c.quality), red:Number(c.advance_num || 0), awakened:!!c.awake_state, season:String(c.season ?? '') }));
  const skills = desc.skill.map(s => ({ id:String(s.skill_id), name:s.name, type:s.skill_info?.[2] || '未分类', rank:String(s.skill_info?.[4] ?? ''), progress:s.research_progress != null && Number.isFinite(Number(s.research_progress)) ? Number(s.research_progress) : null, description:s.skill_info?.[1] || '' }));
  if(desc.gear != null && !Array.isArray(desc.gear)) throw new Error('账号宝物数据格式不正确');
  const gear = Array.isArray(desc.gear) ? desc.gear.map((g,index) => {
    const heroId=String(g.heroId || '');
    const hero=heroes.find(h=>h.id===heroId);
    const effects=rows=>Array.isArray(rows)?rows.filter(Array.isArray).map(row=>({name:String(row[0] || ''),description:String(row[1] || '')})):[];
    return {id:`${g.gear_id}-${index}`,gearId:String(g.gear_id),iconId:String(g.show_gear_id ?? g.gear_id),name:String(g.name || '未知宝物'),phase:Number(g.phase || 0),level:Number(g.level || 0),advance:Number(g.advance || 0),bound:!!g.is_bind,defective:!!g.is_defective,heroId,equippedTo:hero?[hero.country,hero.name,hero.troop].join('·'):heroId?`武将 ID ${heroId}`:'',conditions:Array.isArray(g.equip_condition)?g.equip_condition.map(String):[],effects:effects(g.skillInfo),levelType:Number(g.level_type ?? 0),features:effects(g.feature).map((feature,index)=>({...feature,extreme:!!g.feature[index][2]}))};
  }) : null;
  return { metadata:{ ...classifyServer(equip.server_name), status:equip.status_desc || '未知', sold:/买家取走|已售|交易成功/.test(equip.status_desc || ''), price:Number(equip.price)/100, server:[equip.area_name,equip.server_name].filter(Boolean).join(' · '), summary:equip.desc_sumup_short || '', order:equip.game_ordersn || '', fetchedAt:new Date().toISOString() }, heroes, skills, gear };
}
export function mergeCatalog(catalog, owned, kind) {
  const groups = new Map();
  for (const item of owned) { const key=String(item.id); if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(item); }
  const entries = new Map(catalog.map(item => [String(item.id), {...item, copies:[], owned:false}]));
  for (const [id,copies] of groups) entries.set(id,{...entries.get(id),...copies[0],copies,owned:true,outsideCatalog:!entries.has(id)});
  return [...entries.values()].map(item=>({...item,kind}));
}

export function importAccount(raw) {
  if(raw?.format !== 'zzxai-account-v1') return normalizeAccount(raw);
  const data=raw.account;
  if(!data?.metadata || !Array.isArray(data.heroes) || !Array.isArray(data.skills) || typeof data.metadata.fetchedAt !== 'string' || !Number.isFinite(Date.parse(data.metadata.fetchedAt))) throw new Error('导出的账号清单格式不完整');
  for(const item of [...data.heroes,...data.skills]) if(typeof item.id !== 'string' || typeof item.name !== 'string') throw new Error('账号清单条目格式不正确');
  for(const item of data.heroes) if(!Number.isFinite(item.rarity) || !Number.isFinite(item.red)) throw new Error('武将属性格式不正确');
  for(const item of data.skills) if(item.progress !== null && !Number.isFinite(item.progress)) throw new Error('战法进度格式不正确');
  const gear=data.gear ?? null;
  if(gear !== null && (!Array.isArray(gear) || gear.some(g=>!g || typeof g.id!=='string' || typeof g.name!=='string' || !Number.isFinite(g.phase) || !Number.isFinite(g.level) || !Number.isFinite(g.advance) || !Array.isArray(g.effects) || !Array.isArray(g.features) || !Array.isArray(g.conditions) || [...g.effects,...g.features].some(e=>!e || typeof e.name!=='string' || typeof e.description!=='string')))) throw new Error('宝物清单格式不正确');
  return {...data,metadata:{...data.metadata,...classifyServer(data.metadata.serverNum || data.metadata.server)},gear};
}

export function heroLabel(item) {
  const version=item.season && item.season!=='N'?item.season:item.version && item.version!=='常规'?item.version:'';
  return [item.name,version,item.troop,item.country,`${item.rarity}星`].filter(Boolean).join(' · ');
}
export function compareCollections(catalog,left,right,kind) {
  const owned=items=>{const map=new Map();for(const item of items){if(!map.has(item.id))map.set(item.id,[]);map.get(item.id).push(item);}return map;};
  const a=owned(left),b=owned(right),definitions=new Map(catalog.map(item=>[item.id,item]));
  const signature=copies=>JSON.stringify(copies.length?[Math.max(...copies.map(item=>Math.min(5,item.rarity,item.red)))]:[]);
  const rows=[...new Set([...a.keys(),...b.keys()])].map(id=>{
    const leftCopies=a.get(id)||[],rightCopies=b.get(id)||[];
    const definition=definitions.get(id)||{},actual=leftCopies[0]||rightCopies[0];
    const item={...definition,...actual,season:actual.season||definition.season||'',left:leftCopies,right:rightCopies};
    return {...item,label:kind==='heroes'?heroLabel(item):item.name,different:kind==='skills'?!!leftCopies.length!==!!rightCopies.length:signature(leftCopies)!==signature(rightCopies)};
  });
  const labels=new Map();for(const row of rows)labels.set(row.label,(labels.get(row.label)||0)+1);
  return rows.map(row=>({...row,label:labels.get(row.label)>1?`${row.label}（${row.id}）`:row.label}));
}

export function canDismantle(skill, heroes) {
  if (skill.acquisition !== "武将拆解" || !Array.isArray(skill.researchHeroIds)) return false;
  const owned = new Set(heroes.map(hero => String(hero.id)));
  return skill.researchHeroIds.some(id => owned.has(String(id)));
}

export function heroSortOrder(item) {
 const version=item.season && item.season!=='N'?item.season:item.version;
 return {S2:0,S3:1,XP:2}[String(version||'').match(/^(S2|S3|XP)/)?.[0]] ?? 3;
}

export function treasureLabel(item) {
 if (item.levelType == null) return '';
 if (item.levelType === 2 && item.advance === 1) return '红武';
 const extreme=!!item.features?.[0]?.extreme;
 return item.levelType === 2 ? extreme?'粉极':'粉武' : extreme?'蓝极':'蓝武';
}

export function skillGradeOrder(item) {
 return {S:0,A:1,B:2,C:3,D:4}[String(item.grade||'').toUpperCase()] ?? 5;
}
