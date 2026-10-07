const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const db = getFirestore();

async function getCallerRank(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const snap = await db.collection('users').doc(request.auth.uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'Your ANS profile does not exist.');
  }

  const rank = snap.data().rank;
  if (!['R4', 'R5'].includes(rank)) {
    throw new HttpsError('permission-denied', 'Only R4 and R5 can send notifications.');
  }

  return { rank, profile: snap.data() };
}

exports.listNotificationMembers = onCall(async (request) => {
  const caller = await getCallerRank(request);
  const snap = await db.collection('users').get();

  const members = snap.docs.map(doc => {
    const data = doc.data() || {};
    return {
      uid: doc.id,
      email: data.email || '',
      rank: data.rank || ''
    };
  }).filter(member => member.email);

  members.sort((a, b) => a.email.localeCompare(b.email));

  return { members, callerRank: caller.rank };
});

exports.sendAnsNotification = onCall(async (request) => {
  const caller = await getCallerRank(request);

  const title = String(request.data?.title || '').trim();
  const body = String(request.data?.body || '').trim();
  const recipientUid = String(request.data?.recipientUid || '').trim();

  if (!title || !body || !recipientUid) {
    throw new HttpsError('invalid-argument', 'Recipient, title and message are required.');
  }

  if (title.length > 100 || body.length > 1000) {
    throw new HttpsError('invalid-argument', 'The title or message is too long.');
  }

  const recipientSnap = await db.collection('users').doc(recipientUid).get();
  if (!recipientSnap.exists) {
    throw new HttpsError('not-found', 'The selected member does not exist.');
  }

  const recipient = recipientSnap.data() || {};
  const tokenSnap = await db.collection('fcmTokens')
    .where('uid', '==', recipientUid)
    .get();

  const tokens = tokenSnap.docs
    .map(doc => doc.data()?.token)
    .filter(Boolean);

  if (!tokens.length) {
    throw new HttpsError('failed-precondition', 'That member has no device with notifications activated.');
  }

  const messages = tokens.map(token => ({
    token,
    notification: { title, body },
    data: {
      title,
      body,
      url: './',
      tag: 'ans-notification'
    },
    webpush: {
      fcmOptions: { link: './' }
    }
  }));

  const result = await getMessaging().sendEach(messages);

  await db.collection('announcements').add({
    title,
    body,
    recipientUid,
    recipientEmail: recipient.email || '',
    senderUid: request.auth.uid,
    senderEmail: request.auth.token.email || caller.profile.email || '',
    senderRank: caller.rank,
    sentDevices: result.successCount,
    failedDevices: result.failureCount,
    createdAt: FieldValue.serverTimestamp()
  });

  return {
    ok: result.successCount > 0,
    sentDevices: result.successCount,
    failedDevices: result.failureCount
  };
});
