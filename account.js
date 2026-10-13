import {parseAccountLink,importAccount,mergeCatalog} from './account-core.mjs';
const $=id=>document.getElementById(id);
let catalog,account=null,tab='heroes',busy=false;
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function setBusy(value){busy=value;$('query-button').disabled=value;$('import-file').disabled=value;$('query-form').setAttribute('aria-busy',String(value));}
function render(){
 if(!catalog)return;
 const kind=tab==='heroes'?'武将':'战法',owned=account?.[tab]||[];
 const all=mergeCatalog(catalog[tab],owned,tab);
 $('catalog-note').textContent=`${catalog[tab].length} 种${kind} · 更新于 ${catalog.asOf}${!account?' · 查询后查看拥有状态':''}`;
 $('country-filter').hidden=tab!=='heroes';$('rarity-filter').hidden=tab!=='heroes';$('type-filter').hidden=tab!=='skills';
 $('ownership').disabled=!account;
 const search=$('search').value.trim().toLowerCase();
 const results=all.filter(item=>(!search||[item.name,item.country,item.troop,item.type].join(' ').toLowerCase().includes(search))&&(!account||$('ownership').value==='all'||($('ownership').value==='owned'?item.owned:!item.owned))&&(tab!=='heroes'||(($('country').value==='all'||item.country===$('country').value)&&($('rarity').value==='all'||String(item.rarity)===$('rarity').value)))&&(tab!=='skills'||$('skill-type').value==='all'||item.type===$('skill-type').value));
 results.sort((a,b)=>Number(b.owned)-Number(a.owned)||(b.rarity||0)-(a.rarity||0)||a.name.localeCompare(b.name,'zh-CN'));
 $('result-count').textContent=`显示 ${results.length} / ${all.length} 项${account?` · 已拥有 ${all.filter(x=>x.owned).length} 种${kind} · 目录内未拥有 ${all.filter(x=>!x.owned).length} 种`:''}`;
 $('results').replaceChildren();$('results').setAttribute('aria-labelledby',tab==='heroes'?'heroes-tab':'skills-tab');$('empty').hidden=results.length!==0;
 const fragment=document.createDocumentFragment();
 for(const item of results){
  const article=node('article',undefined,`entry ${!account?'unknown':item.owned?'owned':'missing'}`);
  article.append(node('span',!account?'等待查询':item.owned?'已拥有':'未拥有','badge'));
  if(tab==='heroes'&&item.portrait){const img=node('img',undefined,'portrait');img.src=item.portrait;img.alt='';img.loading='lazy';img.addEventListener('error',()=>img.remove());article.append(img);}
  article.append(node('h3',item.name));
  if(tab==='heroes'){
   article.append(node('p',`${item.country||'未分类'} · ${item.troop||'未分类'} · ${item.rarity||'?'} 星${item.version?' · '+item.version:''}`));
   if(item.owned){article.append(node('p',item.copies.map(c=>`${c.red} 红${c.awakened?' · 已觉醒':''}`).join(' / '),'red'));if(item.copies.length>1)article.append(node('p',`重复卡 ${item.copies.length} 张`));}
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
 account=data;$('account-info').hidden=false;$('account-status').textContent=data.metadata.sold?'账号已售出':`账号状态：${data.metadata.status}`;
 $('account-server').textContent=data.metadata.server;
 $('account-summary').textContent=data.metadata.summary;
 $('account-time').textContent=`${data.metadata.sold?'原展示价格':'展示价格'}：${Number.isFinite(data.metadata.price)?data.metadata.price.toLocaleString()+' 元':'未知'} · 查询时间（北京时间）：${new Date(data.metadata.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}${data.metadata.sold?' · 以下为交易后仍可查询的快照':''}`;
 const stats=[['五星卡片',data.heroes.filter(h=>h.rarity===5).length],['武将卡片',data.heroes.length],['战法条目',data.skills.length],['研究完成',data.skills.filter(s=>s.progress===100).length]];
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
for(const id of ['search','ownership','country','rarity','skill-type'])$(id).addEventListener('input',render);
function selectTab(next){tab=next;for(const [id,kind]of [['heroes-tab','heroes'],['skills-tab','skills']]){$(id).setAttribute('aria-selected',String(tab===kind));$(id).tabIndex=tab===kind?0:-1;}render();}
for(const [id,kind]of [['heroes-tab','heroes'],['skills-tab','skills']]){$(id).addEventListener('click',()=>selectTab(kind));$(id).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'heroes':event.key==='End'?'skills':kind==='heroes'?'skills':'heroes';selectTab(next);$(next+'-tab').focus();}});}
selectTab('heroes');setBusy(true);
try{const response=await fetch('./account-assets/catalog.json');if(!response.ok)throw new Error('目录下载失败');catalog=await response.json();render();message('输入商品链接，或导入藏宝阁详情 JSON。');setBusy(false);}catch{message('图鉴目录载入失败，请刷新重试',true);}
