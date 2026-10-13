import {parseAccountLink,importAccount,mergeCatalog,classifyServer} from './account-core.mjs';
const $=id=>document.getElementById(id);
let catalog,account=null,tab='heroes',busy=false;
const skillOrder=['主动','被动','追击','指挥'];
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function setBusy(value){busy=value;$('query-button').disabled=value;$('import-file').disabled=value;$('query-form').setAttribute('aria-busy',String(value));}
function render(){
 if(!catalog)return;
 const kind={heroes:'武将',skills:'战法',gear:'宝物'}[tab],owned=account?.[tab]||[];
 const all=tab==='gear'?owned.map(item=>({...item,owned:true})):mergeCatalog(catalog[tab],owned,tab);
 $('catalog-note').textContent=tab==='gear'?(!account?'查询后查看账号宝物':account.gear==null?'当前数据未包含宝物，请重新查询或导入完整详情 JSON':`共 ${owned.length} 件宝物`):`${catalog[tab].length} 种${kind} · 更新于 ${catalog.asOf}${!account?' · 查询后查看拥有状态':''}`;
 $('country-filter').hidden=tab!=='heroes';$('season-filter').hidden=tab!=='heroes';$('search').placeholder={heroes:'输入武将名称',skills:'输入战法名称',gear:'输入宝物名称或词条'}[tab];$('rarity-filter').hidden=tab!=='heroes';$('type-filter').hidden=tab!=='skills';
 $('ownership').disabled=!account;$('ownership-filter').hidden=tab==='gear';$('gear-quality-filter').hidden=tab!=='gear';
 const search=$('search').value.trim().toLowerCase();
 const results=all.filter(item=>{
  const haystack=[item.name,item.country,item.troop,item.type,...(item.features||[]).map(e=>e.name),...(item.effects||[]).map(e=>e.name)].join(' ').toLowerCase();
  if(search&&!haystack.includes(search))return false;
  if(tab!=='gear'&&account&&$('ownership').value!=='all'&&($('ownership').value==='owned'?!item.owned:item.owned))return false;
  if(tab==='heroes'&&(($('country').value!=='all'&&item.country!==$('country').value)||($('rarity').value!=='all'&&String(item.rarity)!==$('rarity').value)))return false;
  if(tab==='heroes'&&$('season').value!=='all'&&item.season!==$('season').value)return false;
  if(tab==='skills'&&$('skill-type').value!=='all'&&item.type!==$('skill-type').value)return false;
  if(tab==='gear'&&$('gear-quality').value!=='all'&&String(item.phase)!==$('gear-quality').value)return false;
  return true;
 });
 results.sort((a,b)=>(tab==='skills'?((skillOrder.includes(a.type)?skillOrder.indexOf(a.type):4)-(skillOrder.includes(b.type)?skillOrder.indexOf(b.type):4)):0)||Number(b.owned)-Number(a.owned)||(b.phase||b.rarity||0)-(a.phase||a.rarity||0)||a.name.localeCompare(b.name,'zh-CN'));
 $('result-count').textContent=`显示 ${results.length} / ${all.length} 项${account&&tab!=='gear'?` · 已拥有 ${all.filter(x=>x.owned).length} 种${kind} · 目录内未拥有 ${all.filter(x=>!x.owned).length} 种`:''}`;
 $('results').replaceChildren();$('results').setAttribute('aria-labelledby',tab+'-tab');$('empty').hidden=results.length!==0;
 $('empty').textContent=tab==='gear'&&!account?'输入藏宝阁链接，查看账号宝物。':tab==='gear'&&account.gear==null?'请重新查询账号，获取宝物信息。':tab==='gear'&&owned.length===0?'该账号没有宝物。':'没有符合条件的条目，试试其他筛选条件。';
 if(tab==='gear'&&(!account||account.gear==null))$('result-count').textContent='尚未载入宝物清单';
 const fragment=document.createDocumentFragment();
 const groupCounts=new Map();for(const item of results)groupCounts.set(item.type,(groupCounts.get(item.type)||0)+1);
 let previousType=null;
 for(const item of results){
  if(tab==='skills'&&item.type!==previousType){previousType=item.type;fragment.append(node('h2',`${item.type||'未分类'} · ${groupCounts.get(item.type)} 种`,'skill-group-heading'));}
  const article=node('article',undefined,`entry ${!account?'unknown':item.owned?'owned':'missing'}`);
  article.append(node('span',!account?'等待查询':item.owned?'已拥有':'未拥有','badge'));
  if(tab==='heroes'||tab==='gear'){
   article.classList.add(tab==='heroes'?'hero-entry':'gear-entry');
   const src=tab==='heroes'?item.portrait:catalog.gearImages?.[item.iconId||item.gearId];
   const art=node('div',undefined,tab==='heroes'?'hero-art':'gear-art');
   const fallback=node('span',tab==='heroes'?'暂无立绘':'暂无图片','art-placeholder');art.append(fallback);
   if(src){const img=node('img',undefined,'entry-art');img.src=src;img.alt=`${item.name}${tab==='heroes'?'立绘':'宝物图片'}`;img.loading='lazy';img.decoding='async';img.addEventListener('load',()=>fallback.hidden=true);img.addEventListener('error',()=>img.remove());art.append(img);}
   article.append(art);
  }
  article.append(node('h3',item.name));
  if(tab==='heroes'){
   article.append(node('p',`${item.country||'未分类'} · ${item.troop||'未分类'} · ${item.rarity||'?'} 星${item.version?' · '+item.version:''}`));
   if(item.owned){article.append(node('p',item.copies.map(c=>`${c.red} 红${c.awakened?' · 已觉醒':''}`).join(' / '),'red'));if(item.copies.length>1)article.append(node('p',`重复卡 ${item.copies.length} 张`));}
  }else if(tab==='gear'){
   article.append(node('p',`${{1:'精品',2:'罕俦',3:'稀世'}[item.phase]||'品质未知'} · 等级 ${item.level}${item.advance?' · 进阶 '+item.advance:''}`));
   if(item.equippedTo)article.append(node('p',`装备：${item.equippedTo}`));
   if(item.bound||item.defective)article.append(node('p',[item.bound?'已绑定':'',item.defective?'残次':''].filter(Boolean).join(' · ')));
   for(const [label,effects] of [['宝物效果',item.effects],['附加词条',item.features]]){if(effects?.length){const details=node('details');details.open=true;details.append(node('summary',label));for(const effect of effects)details.append(node('div',`${effect.name}：${effect.description}`,'skill-desc'));article.append(details);}}
   if(item.conditions?.length){const details=node('details');details.append(node('summary','装备条件'),node('div',item.conditions.join('；'),'skill-desc'));article.append(details);}
  }else{
   article.append(node('p',`${item.type||'未分类'}${item.grade?' · '+item.grade+' 级':''}`));
   if(item.owned)article.append(node('p',`研究进度：${item.progress===null?'未知':item.progress+'%'}`));
   if(item.acquisition){article.append(node('p',item.acquisition));if(item.acquisitionText || item.researchHeroes?.length){const details=node('details');details.append(node('summary','获取方式'),node('div',item.acquisitionText||item.researchHeroes.join('、'),'skill-desc'));article.append(details);}}
   if(item.description){const details=node('details');details.append(node('summary','战法说明'),node('div',item.description,'skill-desc'));article.append(details);}
  }
  fragment.append(article);
 }
 $('results').append(fragment);
}
function showAccount(data){
 data={...data,metadata:{...data.metadata,...classifyServer(data.metadata.serverNum || data.metadata.server)}};
 account=data;$('account-info').hidden=false;$('account-status').textContent=data.metadata.sold?'账号已售出':`账号状态：${data.metadata.status}`;
 $('account-type').textContent=data.metadata.accountType;$('account-type').classList.toggle('trial',data.metadata.accountType==='试师');
 $('account-server').textContent=data.metadata.server;
 $('account-summary').textContent=data.metadata.summary;
 $('account-time').textContent=`${data.metadata.sold?'原展示价格':'展示价格'}：${Number.isFinite(data.metadata.price)?data.metadata.price.toLocaleString()+' 元':'未知'} · 查询时间（北京时间）：${new Date(data.metadata.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}${data.metadata.sold?' · 以下为交易后仍可查询的快照':''}`;
 const stats=[['宝物数量',Array.isArray(data.gear)?data.gear.length:'—'],['稀世宝物',Array.isArray(data.gear)?data.gear.filter(g=>g.phase===3).length:'—'],['五星卡片',data.heroes.filter(h=>h.rarity===5).length],['武将卡片',data.heroes.length],['战法条目',data.skills.length],['研究完成',data.skills.filter(s=>s.progress===100).length]];
 $('stats').replaceChildren(...stats.map(([title,value])=>{const el=node('div',undefined,'stat');el.append(node('strong',String(value)),node('span',title));return el;}));
 render();message('账号数据已载入。');
}
$('query-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!catalog)return;
 try{parseAccountLink($('account-url').value);}catch(e){message(e.message,true);return;}
 setBusy(true);message('正在获取藏宝阁详情…');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
 try{
  const response=await fetch(`/api/account?url=${encodeURIComponent($('account-url').value.trim())}`,{signal:controller.signal});
  let data;try{data=await response.json();}catch{throw new Error('查询服务暂不可用，请稍后重试或导入详情 JSON');}
  if(!response.ok)throw new Error(data.error||'查询失败');
  if(!data.metadata||!Array.isArray(data.heroes)||!Array.isArray(data.skills))throw new Error('查询服务返回的数据不完整');
  showAccount(data);
 }catch(e){message(`${e.name==='AbortError'?'查询超时，请稍后重试':e.message}${account?'。仍显示上一次成功查询的账号。':''}`,true);}finally{clearTimeout(timer);setBusy(false);}
});
$('import-file').addEventListener('change',async event=>{
 const file=event.target.files[0];if(!file||busy)return;
 try{if(file.size>5000000)throw new Error('请选择小于 5 MB 的详情 JSON');const raw=JSON.parse(await file.text());showAccount(importAccount(raw));}catch(e){message(`导入失败：${e.message}`,true);}finally{event.target.value='';}
});
$('export-button').addEventListener('click',()=>{
 if(!account)return;const blob=new Blob([JSON.stringify({format:'zzxai-account-v1',account},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='藏宝阁账号清单.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
for(const id of ['search','ownership','country','rarity','season','skill-type','gear-quality'])$(id).addEventListener('input',render);
function selectTab(next){tab=next;for(const [id,kind]of [['heroes-tab','heroes'],['skills-tab','skills'],['gear-tab','gear']]){$(id).setAttribute('aria-selected',String(tab===kind));$(id).tabIndex=tab===kind?0:-1;}render();}
for(const [id,kind]of [['heroes-tab','heroes'],['skills-tab','skills'],['gear-tab','gear']]){$(id).addEventListener('click',()=>selectTab(kind));$(id).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'heroes':event.key==='End'?'gear':['heroes','skills','gear'][(['heroes','skills','gear'].indexOf(kind)+(event.key==='ArrowLeft'?2:1))%3];selectTab(next);$(next+'-tab').focus();}});}
selectTab('heroes');setBusy(true);
try{const response=await fetch('./account-assets/catalog.json');if(!response.ok)throw new Error('目录下载失败');catalog=await response.json();render();message('输入商品链接，或导入藏宝阁详情 JSON。');setBusy(false);}catch{message('图鉴目录载入失败，请刷新重试',true);}
