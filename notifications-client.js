/* ANS — Last Asylum | Web Push client
   Replace VAPID_PUBLIC_KEY with the public Web Push key from Firebase Console.
*/
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCdsBBd8-TtX8T8zDFiSr5xumDwD51H0Mc',
  authDomain: 'lap-ans.firebaseapp.com',
  projectId: 'lap-ans',
  storageBucket: 'lap-ans.firebasestorage.app',
  messagingSenderId: '1008708931374',
  appId: '1:1008708931374:web:c433bbc2eade9fcfbc34bf',
  measurementId: 'G-4XCBZMJ6YQ'
};

const VAPID_PUBLIC_KEY = 'BIg4XxQZ3F42lXMkPyYgMvHhbcZnfoneClhuXZXVsTWRYifU9-RQ_fsXcUTSPL5jpxmfZbp6_XjL9mgMgDjNbkI';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const messaging = getMessaging(app);

let currentUser = null;
let notificationsReady = false;

async function registerPushForCurrentUser() {
  if (!currentUser) throw new Error('Debes iniciar sesión primero.');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Este navegador no soporta notificaciones push para ANS.');
  }
  if (VAPID_PUBLIC_KEY.startsWith('PEGA_AQUI')) {
    throw new Error('Falta configurar la VAPID public key de Firebase.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('El permiso de notificaciones fue rechazado.');
  }

  const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js', {
    scope: './'
  });
  await navigator.serviceWorker.ready;

  const token = await getToken(messaging, {
    vapidKey: VAPID_PUBLIC_KEY,
    serviceWorkerRegistration: registration
  });

  if (!token) throw new Error('Firebase no devolvió un token de notificación.');

  // Se guarda un registro por instalación/dispositivo.
  await addDoc(collection(db, 'fcmTokens'), {
    uid: currentUser.uid,
    email: currentUser.email || '',
    token,
    platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : 'Web',
    userAgent: navigator.userAgent,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  notificationsReady = true;
  return token;
}

function initNotificationUI() {
  const button = document.querySelector('[data-ans-enable-notifications]');
  const status = document.querySelector('[data-ans-notification-status]');
  if (!button) return;

  const setStatus = (message, ok = false) => {
    if (!status) return;
    status.textContent = message;
    status.dataset.ok = ok ? 'true' : 'false';
  };

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    button.disabled = !user;
    setStatus(user ? 'Sesión detectada. Puedes activar las notificaciones.' : 'Inicia sesión para activar las notificaciones.');
  });

  button.addEventListener('click', async () => {
    button.disabled = true;
    setStatus('Solicitando permiso…');
    try {
      await registerPushForCurrentUser();
      setStatus('Notificaciones activadas en este dispositivo.', true);
      button.textContent = '✓ Notificaciones activadas';
    } catch (error) {
      console.error('[ANS Push]', error);
      setStatus(error.message || 'No se pudieron activar las notificaciones.');
      button.disabled = false;
    }
  });

  onMessage(messaging, (payload) => {
    console.log('[ANS Push] Mensaje recibido con ANS abierta:', payload);
    // Cuando ANS está abierta, no mostramos otra notificación del navegador automáticamente.
    // Aquí puedes conectar un aviso visual propio si quieres.
  });
}

initNotificationUI();
