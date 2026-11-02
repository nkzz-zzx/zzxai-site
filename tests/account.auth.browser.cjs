const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.ACCOUNT_URL || 'http://127.0.0.1:8034/account.html';
const key='fictional_query_key_for_browser_tests_0123456789';
const cookie='test_session=fictional-server-session';
const denied={status:2,status_code:'SESSION_TIMEOUT',msg:'请先登录再查看'};
const sample={equip:{status_desc:'上架中',server_name:'X5992 百业争鸣',price:10000,equip_desc:{card:[{hero_id:100841,name:'刘秀',country:1,hero_type:3,quality:5,advance_num:1,season:'N'}],skill:[],gear:[]}}};
(async()=>{
 const {default:handler}=await import('../edge-functions/api/account.js');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 const previous=global.fetch,apiCalls=[],upstream=[],errors=[];let state='valid',retryCalls=0;
 page.on('pageerror',e=>errors.push(e.message));
 global.fetch=async(target,options)=>{
  assert.equal(target,'https://stzb.cbg.163.com/cgi/api/get_equip_detail');
  upstream.push(options.headers.Cookie);
  if(state==='retry'&&options.headers.Cookie===cookie&&retryCalls++===0)throw new DOMException('Simulated source timeout','AbortError');
  const data=state==='verify'?{status:3,status_code:'CAPTCHA_AUTH'}:options.headers.Cookie===cookie&&['valid','retry'].includes(state)?sample:denied;
  return new Response(JSON.stringify(data));
 };
 await page.route('**/api/account?*',async route=>{
  const incoming=route.request();apiCalls.push({url:incoming.url(),headers:incoming.headers()});
  const response=await handler({request:new Request(incoming.url(),{headers:incoming.headers()}),env:{CBG_SESSION_COOKIE:cookie,CBG_QUERY_KEY:key}});
  const body=await response.text();assert(!body.includes(cookie));assert(!body.includes(key));
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
 });
 const expand=async()=>{if(await page.locator('#query-controls').isHidden())await page.locator('#query-toggle').click();};
 const query=async(dual=false)=>{
  await expand();await page.locator('#account-url').fill('https://stzb.cbg.163.com/cgi/mweb/equip/1/left');
  await page.locator('#compare-url').fill(dual?'https://stzb.cbg.163.com/cgi/mweb/equip/1/right':'');
  await page.locator('#query-button').click();await page.locator('#query-button:enabled').waitFor({state:'attached'});
 };
 try{
  await page.goto(url);await page.locator('#query-button:enabled').waitFor();
  assert.equal(await page.locator('#query-key').getAttribute('type'),'password');
  assert(await page.locator('#clear-query-key').isDisabled());
  await query();assert.equal(apiCalls.length,1);assert.deepEqual(upstream,[undefined]);
  assert(await page.locator('#query-auth').evaluate(el=>el.open));
  assert.match(await page.locator('#message').innerText(),/授权查询/);
  await page.locator('#query-key').fill(key+'x');await query();
  assert.equal(apiCalls.length,2);assert.equal(upstream.length,1);
  assert.match(await page.locator('#message').innerText(),/口令不正确/);
  await page.locator('#query-key').fill(key);await query();
  assert.equal(upstream.at(-1),cookie);assert(await page.locator('#account-info').isVisible());
  assert.equal(apiCalls.at(-1).headers.authorization,'Bearer '+key);
  assert(apiCalls.every(call=>!call.url.includes(key)&&!call.url.includes(cookie)));
  assert.doesNotMatch(await page.locator('body').innerText(),new RegExp(cookie));
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-button').click();
  const download=await downloadPromise;const exported=require('node:fs').readFileSync(await download.path(),'utf8');
  assert(!exported.includes(key));assert(!exported.includes(cookie));
  state='retry';const beforeRetry=apiCalls.length;await query();
  assert.equal(apiCalls.length,beforeRetry+2);assert(apiCalls.slice(-2).every(call=>call.headers.authorization==='Bearer '+key));
  assert.deepEqual(upstream.slice(-2),[cookie,cookie]);assert.match(await page.locator('#message').innerText(),/已载入/);state='valid';
  const beforeDual=apiCalls.length;await query(true);
  assert.equal(apiCalls.length,beforeDual+2);assert(await page.locator('.comparison-table').isVisible());
  assert(apiCalls.slice(-2).every(call=>call.headers.authorization==='Bearer '+key));
  state='expired';const beforeExpired=apiCalls.length;await query();
  assert.equal(apiCalls.length,beforeExpired+1);assert.match(await page.locator('#message').innerText(),/会话未被藏宝阁接受.*仍显示/);
  state='verify';const beforeVerify=apiCalls.length;await query();
  assert.equal(apiCalls.length,beforeVerify+1);assert.match(await page.locator('#message').innerText(),/官方网页完成/);
  await expand();await page.locator('#clear-query-key').click();
  assert.equal(await page.locator('#query-key').inputValue(),'');assert(await page.locator('#clear-query-key').isDisabled());
  state='valid';await query();assert.equal(upstream.at(-1),undefined);
  await page.locator('#query-key').fill('short');const beforeInvalid=apiCalls.length;await query();
  assert.equal(apiCalls.length,beforeInvalid);assert.match(await page.locator('#message').innerText(),/口令格式不正确/);
  await page.locator('#query-key').fill(key);
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  assert(await page.evaluate(()=>!Object.values(localStorage).some(v=>v.includes('fictional_query_key'))));
  await page.reload();await page.locator('#query-button:enabled').waitFor();
  assert.equal(await page.locator('#query-key').inputValue(),'');
  assert.deepEqual(errors,[]);
  console.log('PASS protected optional sessions, anonymous fallback, incorrect keys, independent header-only authorization, non-persistent password, export exclusion, dual queries, expired sessions, manual verification and responsive layout');
 }finally{global.fetch=previous;await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
