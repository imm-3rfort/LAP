import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, collection, addDoc, query, where, limit, getDocs, serverTimestamp, doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { getMessaging, getToken, isSupported } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCdsBBd8-TtX8T8zDFiSr5xumDwD51H0Mc',
  authDomain: 'lap-ans.firebaseapp.com',
  projectId: 'lap-ans',
  storageBucket: 'lap-ans.firebasestorage.app',
  messagingSenderId: '1008708931374',
  appId: '1:1008708931374:web:c433bbc2eade9fcfbc34bf',
  measurementId: 'G-4XCBZMJ6YQ'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const button = document.querySelector('[data-ans-enable-notifications]');
const status = document.querySelector('[data-ans-notification-status]');
const VAPID_KEY = 'BIg4XxQZ3F42lXMkPyYgMvHhbcZnfoneClhuXZXVsTWRYifU9-RQ_fsXcUTSPL5jpxmfZbp6_XjL9mgMgDjNbkI';

function setStatus(text, ok=false){
  if(!status) return;
  status.textContent = text;
  status.classList.toggle('ok', ok);
}

async function findExistingRank(uid){
  const q = query(collection(db,'fcmTokens'), where('uid','==',uid), limit(20));
  const snap = await getDocs(q);
  for(const d of snap.docs){
    const rank = d.data().rank;
    if(['R1','R2','R3','R4','R5'].includes(rank)) return rank;
  }
  return '';
}

async function activateNotifications(user){
  if(!button) return;
  button.disabled = true;
  setStatus('Linking this device...');
  try{
    if(!('Notification' in window)) throw new Error('notifications-not-supported');
    if(!(await isSupported())) throw new Error('messaging-not-supported');

    const permission = await Notification.requestPermission();
    if(permission !== 'granted') throw new Error('permission-denied');

    const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging,{vapidKey:VAPID_KEY,serviceWorkerRegistration:registration});
    if(!token) throw new Error('token-unavailable');

    const rank = await findExistingRank(user.uid);
    const tokenId = btoa(token).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,140);
    await setDoc(doc(db,'fcmTokens',tokenId),{
      uid:user.uid,
      email:user.email || '',
      token,
      rank:rank || '',
      platform:'web',
      userAgent:navigator.userAgent,
      updatedAt:serverTimestamp(),
      createdAt:serverTimestamp()
    },{merge:true});

    setStatus(rank ? `Notifications activated · ${rank}` : 'Notifications activated.',true);
  }catch(error){
    console.error('[ANS Notifications]',error);
    const messages={
      'permission-denied':'Notification permission was not granted.',
      'notifications-not-supported':'This browser does not support notifications.',
      'messaging-not-supported':'Web notifications are not supported on this device.',
      'token-unavailable':'Firebase could not create a notification token.'
    };
    setStatus(messages[error.message] || 'Notifications could not be activated. Try again.');
  }finally{
    button.disabled=false;
  }
}

button?.addEventListener('click',()=>{
  if(auth.currentUser) activateNotifications(auth.currentUser);
});

onAuthStateChanged(auth,user=>{
  if(!user){
    if(button) button.disabled=true;
    return;
  }
  if(button) button.disabled=false;
});
