/* ANS — Last Asylum | Web Push client */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  isSupported,
  getMessaging,
  getToken,
  onMessage
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCdsBBd8-TtX8T8zDFiSr5xumDwD51H0Mc',
  authDomain: 'lap-ans.firebaseapp.com',
  projectId: 'lap-ans',
  storageBucket: 'lap-ans.firebasestorage.app',
  messagingSenderId: '1008708931374',
  appId: '1:1008708931374:web:c433bbc2eade9fcfbc34bf',
  measurementId: 'G-4XCBZMJ6YQ'
};

const VAPID_PUBLIC_KEY =
  'BIg4XxQZ3F42lXMkPyYgMvHhbcZnfoneClhuXZXVsTWRYifU9-RQ_fsXcUTSPL5jpxmfZbp6_XjL9mgMgDjNbkI';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let messaging = null;
let currentUser = null;

function initNotificationUI() {

  const button = document.querySelector(
    '[data-ans-enable-notifications]'
  );

  const status = document.querySelector(
    '[data-ans-notification-status]'
  );

  if (!button) {
    console.error('[ANS Push] No encontré el botón de notificaciones.');
    return;
  }

  console.log('[ANS Push] Script cargado correctamente.');

  const setStatus = (message, ok = false) => {
    if (!status) return;

    status.textContent = message;
    status.style.color = ok ? '#d8b35a' : '';
  };

  /*
   * Primero comprobamos la sesión de Firebase.
   */
  onAuthStateChanged(auth, (user) => {

    currentUser = user;

    if (user) {
      console.log('[ANS Push] Usuario autenticado:', user.email);

      button.disabled = false;

      setStatus(
        'Sesión detectada. Puedes activar las notificaciones.'
      );

    } else {

      console.log('[ANS Push] No hay usuario autenticado.');

      button.disabled = false;

      setStatus(
        'Debes iniciar sesión en ANS antes de activar las notificaciones.'
      );
    }
  });

  /*
   * Botón de activar notificaciones.
   */
  button.addEventListener('click', async () => {

    console.log('[ANS Push] Botón presionado.');

    button.disabled = true;

    setStatus('Iniciando notificaciones...');

    try {

      if (!currentUser) {
        throw new Error(
          'No hay una sesión de Firebase activa. Cierra sesión, vuelve a iniciar sesión y prueba nuevamente.'
        );
      }

      setStatus('Comprobando compatibilidad...');

      const supported = await isSupported();

      if (!supported) {
        throw new Error(
          'Este navegador no es compatible con Firebase Cloud Messaging.'
        );
      }

      setStatus('Preparando Firebase Messaging...');

      if (!messaging) {
        messaging = getMessaging(app);
      }

      if (!('Notification' in window)) {
        throw new Error(
          'Este navegador no permite notificaciones.'
        );
      }

      if (!('serviceWorker' in navigator)) {
        throw new Error(
          'Este navegador no permite Service Workers.'
        );
      }

      setStatus('Solicitando permiso de notificaciones...');

      const permission = await Notification.requestPermission();

      console.log(
        '[ANS Push] Permiso:',
        permission
      );

      if (permission !== 'granted') {
        throw new Error(
          'El permiso de notificaciones no fue concedido.'
        );
      }

      setStatus('Registrando dispositivo...');

      const registration =
        await navigator.serviceWorker.register(
          './firebase-messaging-sw.js',
          {
            scope: './'
          }
        );

      console.log(
        '[ANS Push] Service Worker registrado:',
        registration.scope
      );

      await navigator.serviceWorker.ready;

      setStatus('Generando token del dispositivo...');

      const token = await getToken(messaging, {
        vapidKey: VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: registration
      });

      if (!token) {
        throw new Error(
          'Firebase no devolvió el token del dispositivo.'
        );
      }

      console.log(
        '[ANS Push] Token obtenido correctamente.'
      );

      setStatus('Guardando dispositivo en Firebase...');

      await addDoc(
        collection(db, 'fcmTokens'),
        {
          uid: currentUser.uid,
          email: currentUser.email || '',
          token: token,
          platform: /iPhone|iPad|iPod/i.test(
            navigator.userAgent
          )
            ? 'iOS'
            : 'Web',
          userAgent: navigator.userAgent,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      );

      console.log(
        '[ANS Push] Dispositivo guardado en Firestore.'
      );

      setStatus(
        '✓ Notificaciones activadas correctamente en este dispositivo.',
        true
      );

      button.textContent =
        '✓ Notificaciones activadas';

    } catch (error) {

      console.error(
        '[ANS Push] ERROR:',
        error
      );

      setStatus(
        'Error: ' +
        (error.message || 'No se pudieron activar las notificaciones.')
      );

      button.disabled = false;
    }
  });

  /*
   * Mensajes recibidos mientras ANS está abierta.
   */
  onAuthStateChanged(auth, async () => {

    try {

      if (!messaging) {

        const supported = await isSupported();

        if (!supported) return;

        messaging = getMessaging(app);
      }

      onMessage(messaging, (payload) => {

        console.log(
          '[ANS Push] Notificación recibida:',
          payload
        );

      });

    } catch (error) {

      console.error(
        '[ANS Push] Error inicializando mensajes:',
        error
      );

    }

  });
}

initNotificationUI();
