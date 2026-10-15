// Offline public help only. Never cache credentials, account pages or API data.
const CACHE='byteback-offline-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/offline.html'))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate'||event.request.method!=='GET')return;
 if(new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).catch(async()=>
  (await caches.open(CACHE)).match('/offline.html')));
});
