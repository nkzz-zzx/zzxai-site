import { parseAccountLink, normalizeAccount } from '../../account-core.js';
const json = (body,status=200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Authorization'}});
const keyPattern=/^[A-Za-z0-9_-]{32,256}$/;
function sameKey(actual,expected){
  let different=actual.length^expected.length;
  for(let index=0;index<expected.length;index++)different|=(actual.charCodeAt(index)||0)^expected.charCodeAt(index);
  return different===0;
}
export default async function onRequest({request,env={}}) {
  if (request.method !== 'GET') return json({error:'仅支持 GET 请求'},405);
  let link;
  try { link=parseAccountLink(new URL(request.url).searchParams.get('url') || ''); } catch(e) { return json({error:e.message},400); }
  const cookie=typeof env?.CBG_SESSION_COOKIE==='string'?env.CBG_SESSION_COOKIE.trim():'';
  const key=typeof env?.CBG_QUERY_KEY==='string'?env.CBG_QUERY_KEY:'';
  const authorizedQueryAvailable=!!cookie&&cookie.length<=16384&&!/[\r\n]/.test(cookie)&&keyPattern.test(key);
  const authorization=request.headers.get('Authorization');
  let authorized=false;
  if(authorization){
    if(!authorizedQueryAvailable)return json({error:'本站尚未启用授权查询，请联系维护者配置，或导入已有的账号 JSON。',code:'AUTHORIZED_QUERY_UNAVAILABLE'},503);
    const provided=authorization.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1]||'';
    if(!sameKey(provided,key))return json({error:'本站查询口令不正确，请重新填写。',code:'QUERY_KEY_INVALID'},401);
    authorized=true;
  }
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),15000);
  let stage='fetch';
  try {
    const headers={'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0','Referer':link.url};
    if(authorized)headers.Cookie=cookie;
    const response=await fetch('https://stzb.cbg.163.com/cgi/api/get_equip_detail',{method:'POST',headers,body:new URLSearchParams({serverid:link.serverid,ordersn:link.ordersn,view_loc:'equip_list'}).toString(),signal:controller.signal,redirect:'manual'});
    if (!response.ok) return json({error:`藏宝阁暂时无法返回详情（${response.status}），请稍后重试`},502);
    stage='read';
    const text=await response.text(); if(text.length>5000000) return json({error:'账号响应过大'},502);
    let raw;try {raw=JSON.parse(text);} catch {return json({error:'藏宝阁返回了验证页面，请稍后重试或导入详情 JSON'},502);}
    if(raw?.status_code==='CAPTCHA_AUTH')return json({error:'藏宝阁要求完成验证，请在官方网页完成后重新授权，或导入已有的账号 JSON。',code:'UPSTREAM_VERIFICATION_REQUIRED'},502);
    if(raw?.status_code==='SESSION_TIMEOUT'){
      if(authorized)return json({error:'授权会话未被藏宝阁接受，请联系维护者检查会话是否已失效，或导入已有的账号 JSON。',code:'UPSTREAM_SESSION_REJECTED',upstreamCode:'SESSION_TIMEOUT'},502);
      return json({error:authorizedQueryAvailable?'藏宝阁要求登录后查看该商品。可展开“授权查询”，填写本站查询口令后重试。':'藏宝阁要求登录后查看该商品，本站暂无法匿名获取详情。可导入已有的账号 JSON。',code:'UPSTREAM_LOGIN_REQUIRED',upstreamCode:'SESSION_TIMEOUT',authorizedQueryAvailable},502);
    }
    try {return json(normalizeAccount(raw));}catch {return json({error:'藏宝阁未返回完整账号数据，商品可能已下架或需要登录'},502);}
  } catch(e) { return json({error:e.name==='AbortError'?'查询超时，请稍后重试':'无法获取藏宝阁详情，请稍后重试或导入详情 JSON',code:controller.signal.aborted?'QUERY_TIMEOUT':stage==='fetch'?'UPSTREAM_FETCH_FAILED':'UPSTREAM_READ_FAILED',errorType:e.name},502); }
  finally {clearTimeout(timeout);}
}
