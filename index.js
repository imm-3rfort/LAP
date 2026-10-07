const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

exports.sendAnsNotification = onCall(async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const uid = request.auth.uid;
  const profileSnap = await db.collection('users').doc(uid).get();
  const rank = profileSnap.exists ? profileSnap.data().rank : null;

  if (!['R4', 'R5'].includes(rank)) {
    throw new HttpsError('permission-denied', 'Only R4 and R5 can issue alliance edicts.');
  }

  const title = String(request.data?.title || '').trim();
  const body = String(request.data?.body || '').trim();

  if (!title || !body) {
    throw new HttpsError('invalid-argument', 'Title and message are required.');
  }

  if (title.length > 120 || body.length > 2000) {
    throw new HttpsError('invalid-argument', 'The title or message is too long.');
  }

  const tokenSnap = await db.collection('fcmTokens').get();
  const tokens = [...new Set(tokenSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => typeof item.token === 'string' && item.token.length > 0)
    .map(item => JSON.stringify({ id: item.id, token: item.token }))
  )].map(value => JSON.parse(value));

  let sent = 0;
  let failed = 0;
  const invalidTokenIds = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    if (!batch.length) continue;

    const response = await admin.messaging().sendEachForMulticast({
      tokens: batch.map(item => item.token),
      data: {
        title,
        body,
        url: 'https://imm-3rfort.github.io/LAP/#ans-command',
        type: 'ANS_EDICT'
      },
      webpush: {
        headers: {
          Urgency: 'high'
        }
      }
    });

    response.responses.forEach((result, index) => {
      if (result.success) {
        sent += 1;
        return;
      }

      failed += 1;
      const code = result.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        invalidTokenIds.push(batch[index].id);
      }
    });
  }

  if (invalidTokenIds.length) {
    const writer = db.bulkWriter();
    invalidTokenIds.forEach(id => writer.delete(db.collection('fcmTokens').doc(id)));
    await writer.close();
  }

  await db.collection('announcements').add({
    title,
    body,
    recipient: 'all',
    senderUid: uid,
    senderEmail: request.auth.token.email || '',
    senderRank: rank,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    notificationSent: true,
    sentDevices: sent,
    failedDevices: failed,
    totalDevices: tokens.length
  });

  logger.info('ANS edict sent', {
    senderUid: uid,
    senderRank: rank,
    sent,
    failed,
    totalDevices: tokens.length
  });

  return {
    success: true,
    sent,
    failed,
    totalDevices: tokens.length
  };
});
