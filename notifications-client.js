import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { getMessaging, getToken, isSupported, onMessage } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js';

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
const vapidKey = 'BIg4XxQZ3F42lXMkPyYgMvHhbcZnfoneClhuXZXVsTWRYifU9-RQ_fsXcUTSPL5jpxmfZbp6_XjL9mgMgDjNbkI';

const button = document.querySelector('[data-ans-enable-notifications]');
const status = document.querySelector('[data-ans-notification-status]');

function setStatus(text, type = '') {
  if (!status) return;
  status.textContent = text;
  status.className = 'account-sub' + (type ? ` ${type}` : '');
}

async function activateNotifications(user) {
  if (!button) return;

  button.disabled = true;
  setStatus('Opening the gates for notifications...');

  try {
    if (!('Notification' in window)) throw new Error('NOTIFICATIONS_UNSUPPORTED');
    if (!('serviceWorker' in navigator)) throw new Error('SERVICE_WORKER_UNSUPPORTED');
    if (!(await isSupported())) throw new Error('FCM_UNSUPPORTED');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('PERMISSION_DENIED');

    const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration
    });

    if (!token) throw new Error('TOKEN_EMPTY');

    const tokenId = encodeURIComponent(token).replace(/%/g, '_');
    await setDoc(doc(db, 'fcmTokens', tokenId), {
      uid: user.uid,
      email: user.email || '',
      token,
      platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Web',
      userAgent: navigator.userAgent,
      updatedAt: serverTimestamp()
    }, { merge: true });

    setStatus('✓ Notifications activated on this device.', 'ok');
    button.textContent = '✓ Notifications activated';
  } catch (error) {
    console.error('[ANS Notifications]', error);
    const messages = {
      NOTIFICATIONS_UNSUPPORTED: 'This browser does not support notifications.',
      SERVICE_WORKER_UNSUPPORTED: 'This browser does not support service workers.',
      FCM_UNSUPPORTED: 'Push notifications are not supported on this browser/device.',
      PERMISSION_DENIED: 'Notification permission was denied. Allow notifications for this site and try again.',
      TOKEN_EMPTY: 'Firebase did not return a notification token.'
    };
    setStatus(messages[error.message] || 'The device could not be linked to ANS notifications.', 'error');
    button.disabled = false;
  }
}

if (button) {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      button.disabled = true;
      button.style.display = 'none';
      setStatus('Sign in to link this device to ANS notifications.');
      return;
    }

    button.style.display = '';
    button.disabled = false;
    button.textContent = '🔔 Activate notifications';
    setStatus('Link this device to receive alerts from ANS.');

    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists() && snap.data().notificationsActivated === true) {
        setStatus('This account has notifications enabled. You can activate this device below.', 'ok');
      }
    } catch (error) {
      console.warn('[ANS Notifications] Could not read user profile:', error);
    }

    button.onclick = () => activateNotifications(user);
  });
}

// Foreground notifications: show the same alert while the site is open.
if (await isSupported().catch(() => false)) {
  const messaging = getMessaging(app);
  onMessage(messaging, payload => {
    const title = payload?.data?.title || payload?.notification?.title || 'ANS Edict';
    const body = payload?.data?.body || payload?.notification?.body || '';
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: './icons/icon-192.png' });
      } catch (error) {
        console.warn('[ANS Notifications] Foreground notification failed:', error);
      }
    }
  });
}
