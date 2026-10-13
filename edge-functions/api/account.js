import { parseAccountLink, normalizeAccount } from '../../account-core.mjs';
const json = (body,status=200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async function onRequest({request}) {
  if (request.method !== 'GET') return json({error:'仅支持 GET 请求'},405);
  let link;
  try { link=parseAccountLink(new URL(request.url).searchParams.get('url') || ''); } catch(e) { return json({error:e.message},400); }
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),15000);
  let stage='fetch';
  try {
    const response=await fetch('https://stzb.cbg.163.com/cgi/api/get_equip_detail',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0','Referer':link.url},body:new URLSearchParams({serverid:link.serverid,ordersn:link.ordersn,view_loc:'equip_list'}).toString(),signal:controller.signal,redirect:'manual'});
    if (!response.ok) return json({error:`藏宝阁暂时无法返回详情（${response.status}），请稍后重试`},502);
    stage='read';
    const text=await response.text(); if(text.length>5000000) return json({error:'账号响应过大'},502);
    let raw;try {raw=JSON.parse(text);} catch {return json({error:'藏宝阁返回了验证页面，请稍后重试或导入详情 JSON'},502);}
    try {return json(normalizeAccount(raw));}catch {return json({error:'藏宝阁未返回完整账号数据，商品可能已下架或需要登录'},502);}
  } catch(e) { return json({error:e.name==='AbortError'?'查询超时，请稍后重试':'无法获取藏宝阁详情，请稍后重试或导入详情 JSON',code:stage==='fetch'?'UPSTREAM_FETCH_FAILED':'UPSTREAM_READ_FAILED',errorType:e.name},502); }
  finally {clearTimeout(timeout);}
}
