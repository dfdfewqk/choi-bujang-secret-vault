// Installation is a presentation feature, never an approval credential.
if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js')
 .catch(()=>{document.querySelector('#app-status').textContent='설치 설정을 확인하지 못했습니다. 온라인 접속을 사용하세요.';});
window.addEventListener('offline',()=>{document.querySelector('#app-status').textContent='오프라인: 서버의 기기 승인을 확인할 수 없습니다.';});
window.addEventListener('online',()=>{document.querySelector('#app-status').textContent='온라인 · 앱 설치와 기기 승인은 별개입니다.';});
