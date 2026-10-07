import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-functions.js';
import { getFirestore, collection, query, where, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

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
const functions = getFunctions(app);
const db = getFirestore(app);
const listMembers = httpsCallable(functions, 'listNotificationMembers');
const sendNotification = httpsCallable(functions, 'sendAnsNotification');

const panel = document.getElementById('ans-command');
const form = document.getElementById('ans-notification-form');
const recipient = document.getElementById('ans-recipient');
const status = document.getElementById('ans-command-status');
const history = document.getElementById('ans-notification-history');

if (panel && form && recipient) {
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function setStatus(text, type = '') {
    status.textContent = text;
    status.className = 'account-message' + (type ? ' ' + type : '');
  }

  function watchHistory(uid) {
    const q = query(
      collection(db, 'announcements'),
      where('recipientUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    return onSnapshot(q, snapshot => {
      if (snapshot.empty) {
        history.innerHTML = '<p class="account-sub">No notifications yet.</p>';
        return;
      }

      history.innerHTML = snapshot.docs.map(doc => {
        const data = doc.data() || {};
        const date = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'Just now';
        return `<div style="padding:.7rem 0;border-top:1px solid rgba(201,155,60,.15);">
          <strong>${escapeHtml(data.title)}</strong><br>
          <span class="account-sub">${escapeHtml(data.body)}</span><br>
          <small class="account-sub">${escapeHtml(data.recipientEmail || '')} · ${escapeHtml(date)}</small>
        </div>`;
      }).join('');
    }, error => {
      console.error('[ANS History]', error);
      history.innerHTML = '<p class="account-sub">History could not be loaded.</p>';
    });
  }

  async function loadMembers() {
    recipient.innerHTML = '<option value="">Loading members...</option>';
    try {
      const result = await listMembers();
      const members = result.data.members || [];
      recipient.innerHTML = '';
      if (!members.length) {
        recipient.innerHTML = '<option value="">No members found</option>';
        return;
      }
      for (const member of members) {
        const option = document.createElement('option');
        option.value = member.uid;
        option.textContent = `${member.email} — ${member.rank || 'Member'}`;
        recipient.appendChild(option);
      }
    } catch (error) {
      console.error('[ANS Command]', error);
      recipient.innerHTML = '<option value="">Could not load members</option>';
      setStatus(error?.message || 'Could not load members.', 'error');
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const recipientUid = recipient.value;
    const title = document.getElementById('ans-notification-title').value.trim();
    const body = document.getElementById('ans-notification-body').value.trim();

    if (!recipientUid || !title || !body) {
      setStatus('Choose a recipient and write the title and message.', 'error');
      return;
    }

    const button = document.getElementById('ans-send-notification');
    button.disabled = true;
    setStatus('Sending the edict...');

    try {
      const result = await sendNotification({ recipientUid, title, body });
      const data = result.data || {};
      setStatus(`✓ Sent to ${data.sentDevices || 0} device(s).`, 'ok');
      form.reset();
      await loadMembers();
    } catch (error) {
      console.error('[ANS Command]', error);
      setStatus(error?.message || 'The notification could not be sent.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  onAuthStateChanged(auth, async user => {
    if (!user) {
      panel.style.display = 'none';
      return;
    }

    try {
      await loadMembers();
      panel.style.display = 'block';
      watchHistory(user.uid);
    } catch (error) {
      panel.style.display = 'none';
    }
  });
}
