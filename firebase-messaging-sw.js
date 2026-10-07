importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCdsBBd8-TtX8T8zDFiSr5xumDwD51H0Mc',
  authDomain: 'lap-ans.firebaseapp.com',
  projectId: 'lap-ans',
  storageBucket: 'lap-ans.firebasestorage.app',
  messagingSenderId: '1008708931374',
  appId: '1:1008708931374:web:c433bbc2eade9fcfbc34bf',
  measurementId: 'G-4XCBZMJ6YQ'
});

const messaging=firebase.messaging();

messaging.onBackgroundMessage(payload=>{
  const data=payload.data || {};
  const title=data.title || 'ANS';
  const body=data.body || 'You have a new alliance edict.';
  self.registration.showNotification(title,{
    body,
    icon:'./icons/icon-192.png',
    badge:'./icons/icon-192.png',
    data:{url:data.url || './',type:data.type || 'ANS'}
  });
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url || './';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if('focus' in client){
        client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  }));
});
