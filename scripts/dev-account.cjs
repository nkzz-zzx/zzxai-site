// Local preview of the same EdgeOne handler. Python uses the environment's trusted HTTPS proxy.
const http=require('node:http');const fs=require('node:fs/promises');const path=require('node:path');const {execFile}=require('node:child_process');
const root=path.resolve(__dirname,'../dist');const port=Number(process.env.PORT||8010);
const python=`import urllib.request,sys,json,urllib.error
p=json.load(sys.stdin)
r=urllib.request.Request(p['url'],data=p['body'].encode(),headers=p['headers'])
try:
 with urllib.request.urlopen(r,timeout=15) as s:
  print(json.dumps({'status':s.status,'body':s.read(5000001).decode()}))
except urllib.error.HTTPError as e:
 print(json.dumps({'status':e.code,'body':''}))
`;
const upstreamFetch=async(url,options)=>new Promise((resolve,reject)=>{
 const child=execFile('python3',['-c',python],{maxBuffer:7000000,signal:options.signal},(error,stdout)=>{if(error)return reject(error);try{const data=JSON.parse(stdout);resolve(new Response(data.body,{status:data.status}));}catch(e){reject(e);}});
 child.stdin.end(JSON.stringify({url,body:String(options.body),headers:options.headers}));
});
(async()=>{
 const {default:handler}=await import('../edge-functions/api/account.js');
 global.fetch=upstreamFetch;
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.pdf':'application/pdf'};
 http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,`http://127.0.0.1:${port}`);
   if(url.pathname==='/api/account'){
    const result=await handler({request:new Request(url,{method:req.method})});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
   const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end('Preview request failed');}
 }).listen(port,'127.0.0.1',()=>console.log(`Account preview listening on port ${port}`));
})().catch(e=>{console.error(e.message);process.exit(1);});
