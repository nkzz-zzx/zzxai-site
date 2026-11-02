const {test}=require('node:test');
const assert=require('node:assert/strict');
const cookie='test_session=fictional-session-for-unit-tests';
const key='fictional_query_key_for_tests_0123456789';
const env={CBG_SESSION_COOKIE:cookie,CBG_QUERY_KEY:key};
const link='https://stzb.cbg.163.com/cgi/mweb/equip/1/sample';
const make=(authorization,extra={})=>new Request('https://zzxai.cn/api/account?url='+encodeURIComponent(link),{headers:{...extra,...(authorization?{Authorization:authorization}:{})}});
const success={equip:{status_desc:'上架中',server_name:'X5992 百业争鸣',price:10000,equip_desc:{card:[],skill:[],gear:[]}}};
const denied={status:2,status_code:'SESSION_TIMEOUT',msg:'请先登录再查看'};

test('configured sessions are used only after the independent query key is verified',async()=>{
  const {default:handler}=await import('../edge-functions/api/account.js');
  const previous=global.fetch,calls=[];
  try{
    global.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(options.headers.Cookie?success:denied));};
    let response=await handler({request:make(null,{Cookie:'browser_cookie=not-forwarded'}),env});let data=await response.json();
    assert.equal(response.status,502);assert.equal(data.code,'UPSTREAM_LOGIN_REQUIRED');assert.equal(data.authorizedQueryAvailable,true);
    assert.equal(calls[0].options.headers.Cookie,undefined);assert.equal(calls[0].options.headers.Authorization,undefined);
    response=await handler({request:make('Bearer '+key),env});data=await response.json();
    assert.equal(response.status,200);assert.deepEqual(data.heroes,[]);assert.deepEqual(data.skills,[]);
    assert.equal(calls[1].options.headers.Cookie,cookie);assert.equal(calls[1].options.headers.Authorization,undefined);
    assert.equal(calls[1].url,'https://stzb.cbg.163.com/cgi/api/get_equip_detail');assert.equal(calls[1].options.redirect,'manual');
    assert(!calls[1].options.body.includes(key));assert(!calls[1].options.body.includes(cookie));
    const serialized=JSON.stringify(data);assert(!serialized.includes(cookie));assert(!serialized.includes(key));
    assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Vary'),'Authorization');
  }finally{global.fetch=previous;}
});

test('incorrect query keys and malformed authorization never contact CBG',async()=>{
  const {default:handler}=await import('../edge-functions/api/account.js');const previous=global.fetch;let calls=0;
  try{
    global.fetch=async()=>{calls++;throw new Error('must not fetch');};
    for(const authorization of ['Bearer '+key+'x','Bearer '+key.slice(1),'Bearer short','Basic '+key]){
      const result=await handler({request:make(authorization),env});const data=await result.json();
      assert.equal(result.status,401);assert.equal(data.code,'QUERY_KEY_INVALID');assert(!JSON.stringify(data).includes(key));assert(!JSON.stringify(data).includes(cookie));
    }
    assert.equal(calls,0);
    const result=await handler({request:new Request('https://zzxai.cn/api/account?url='+encodeURIComponent('https://evil.test/'),{headers:{Authorization:'Bearer '+key}}),env});
    assert.equal(result.status,400);assert.equal(calls,0);
  }finally{global.fetch=previous;}
});

test('missing, partial and invalid configurations fail closed for authorized requests',async()=>{
  const {default:handler}=await import('../edge-functions/api/account.js');const previous=global.fetch;let calls=0;
  try{
    global.fetch=async()=>{calls++;return new Response(JSON.stringify(denied));};
    for(const configuration of [{},{CBG_SESSION_COOKIE:cookie},{CBG_QUERY_KEY:key},{...env,CBG_QUERY_KEY:'short'},{...env,CBG_SESSION_COOKIE:'x=1\r\nHeader:bad'},{...env,CBG_SESSION_COOKIE:'x'.repeat(16385)}]){
      const result=await handler({request:make('Bearer '+key),env:configuration});assert.equal(result.status,503);assert.equal((await result.json()).code,'AUTHORIZED_QUERY_UNAVAILABLE');
    }
    assert.equal(calls,0);
    const result=await handler({request:make(null),env:{CBG_SESSION_COOKIE:cookie}});assert.equal(result.status,502);assert.equal((await result.json()).authorizedQueryAvailable,false);assert.equal(calls,1);
  }finally{global.fetch=previous;}
});

test('rejected sessions and required verification are separate from network timeouts',async()=>{
  const {default:handler}=await import('../edge-functions/api/account.js');const previous=global.fetch;
  try{
    global.fetch=async()=>new Response(JSON.stringify(denied));
    let result=await handler({request:make('Bearer '+key),env}),data=await result.json();
    assert.equal(result.status,502);assert.equal(data.code,'UPSTREAM_SESSION_REJECTED');assert.match(data.error,/会话未被藏宝阁接受/);assert.notEqual(data.code,'QUERY_TIMEOUT');
    global.fetch=async()=>new Response(JSON.stringify({status:3,status_code:'CAPTCHA_AUTH'}));
    result=await handler({request:make('Bearer '+key),env});data=await result.json();
    assert.equal(result.status,502);assert.equal(data.code,'UPSTREAM_VERIFICATION_REQUIRED');assert.match(data.error,/官方网页完成/);
    assert(!JSON.stringify(data).includes(cookie));assert(!JSON.stringify(data).includes(key));
  }finally{global.fetch=previous;}
});
