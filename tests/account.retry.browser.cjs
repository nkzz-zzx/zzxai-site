async function expandQuery(p){if(await p.locator('#query-controls').isHidden())await p.locator('#query-toggle').click();}
const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});const p=await b.newPage();
 try{
 await p.addInitScript(()=>{const original=setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===22000?50:ms,...args);});
 await p.goto(process.env.ACCOUNT_URL||'http://127.0.0.1:8014/account.html');await p.locator('#query-button:enabled').waitFor({state:'attached'});
 await p.evaluate(()=>{
  const original=window.fetch;window.testMode='upstream';window.calls={};
  window.fetch=async(url,options)=>{
   if(!String(url).startsWith('/api/account?'))return original(url,options);
   const right=new URL(url,location.href).searchParams.get('url').endsWith('/right');const key=right?'right':'left';const n=window.calls[key]=(window.calls[key]||0)+1;
   if(window.testMode==='local'&&n===1)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError')),{once:true}));
   if(window.testMode==='error')return new Response(JSON.stringify({error:'商品不存在'}),{status:502});
   if(window.testMode==='exhausted'||window.testMode==='upstream'&&n===1||window.testMode==='dual'&&right&&n===1)return new Response(JSON.stringify({error:'查询超时',code:'QUERY_TIMEOUT',errorType:'AbortError'}),{status:502});
   return new Response(JSON.stringify({metadata:{fetchedAt:new Date().toISOString(),server:'X5992',status:'在售',price:100},heroes:[],skills:[],gear:[]}));
  };
 });
 const query=async(mode,dual=false)=>{await p.evaluate(mode=>{window.testMode=mode;window.calls={};},mode);await expandQuery(p);await p.locator('#account-url').fill('https://stzb.cbg.163.com/cgi/mweb/equip/1/left');await expandQuery(p);await p.locator('#compare-url').fill(dual?'https://stzb.cbg.163.com/cgi/mweb/equip/1/right':'');await expandQuery(p);await p.locator('#query-button').click();await p.locator('#query-button:enabled').waitFor({state:'attached'});return p.evaluate(()=>window.calls);};
 assert.deepEqual(await query('upstream'),{left:2});assert.match(await p.locator('#message').innerText(),/已载入/);
 assert.deepEqual(await query('local'),{left:2});assert.match(await p.locator('#message').innerText(),/已载入/);
 assert.deepEqual(await query('exhausted'),{left:2});assert.match(await p.locator('#message').innerText(),/重试一次后仍未成功.*仍显示/);
 assert.deepEqual(await query('error'),{left:1});assert.match(await p.locator('#message').innerText(),/商品不存在/);
 assert.deepEqual(await query('dual',true),{left:1,right:2});assert(await p.locator('.comparison-table').isVisible());
 console.log('PASS local and upstream timeout retry, retry limit, retained results, no retry on other errors, independent dual-account retry');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
