const CACHE='zzxai-account-portraits-v1';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/account-assets/portrait-thumbs/'))return;
 event.respondWith((async()=>{
  let cache;try{cache=await caches.open(CACHE);const saved=await cache.match(event.request);if(saved)return saved;}catch{}
  const response=await fetch(event.request);
  if(cache&&response.ok&&response.headers.get('Content-Type')?.startsWith('image/'))event.waitUntil(cache.put(event.request,response.clone()).catch(()=>{}));
  return response;
 })());
});
