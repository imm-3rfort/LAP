const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

async function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};

  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', 'No tienes permisos para enviar notificaciones.');
  }
}

exports.sendAnsNotification = onCall({ region: 'us-central1' }, async (request) => {
  await requireAdmin(request);

  const { uid, title, body, url } = request.data || {};

  if (!title || !body) {
    throw new HttpsError('invalid-argument', 'El título y el mensaje son obligatorios.');
  }

  let query = db.collection('fcmTokens');
  if (uid && uid !== 'all') query = query.where('uid', '==', uid);

  const snapshot = await query.get();
  const docs = snapshot.docs;

  if (!docs.length) {
    return { sent: 0, message: 'No hay dispositivos registrados para ese destinatario.' };
  }

  const messages = docs.map((doc) => {
    const data = doc.data();
    return {
      token: data.token,
      notification: { title, body },
      data: {
        title: String(title),
        body: String(body),
        url: String(url || './'),
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'ans-notification'
      },
      webpush: {
        fcmOptions: { link: String(url || './') }
      }
    };
  });

  let sent = 0;
  let failed = 0;
  const invalidTokenDocs = [];

  for (let start = 0; start < messages.length; start += 500) {
    const chunk = messages.slice(start, start + 500);
    const response = await getMessaging().sendEach(chunk);
    sent += response.successCount;
    failed += response.failureCount;

    response.responses.forEach((result, offset) => {
      if (!result.success) {
        const code = result.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
          invalidTokenDocs.push(docs[start + offset].ref);
        }
      }
    });
  }

  await Promise.all(invalidTokenDocs.map((ref) => ref.delete()));

  return { sent, failed, cleaned: invalidTokenDocs.length };
});
