import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-functions.js';

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
const functions = getFunctions(app, 'us-central1');
const sendAnsNotification = httpsCallable(functions, 'sendAnsNotification');

const commandPanel = document.getElementById('ans-command-panel');
const form = document.getElementById('ans-command-form');
const titleInput = document.getElementById('ans-command-title');
const bodyInput = document.getElementById('ans-command-body');
const sendButton = document.getElementById('ans-command-send');
const status = document.getElementById('ans-command-status');
const history = document.getElementById('ans-command-history');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function setStatus(text, type = '') {
  if (!status) return;
  status.textContent = text;
  status.className = 'ans-command-status' + (type ? ` ${type}` : '');
}

function formatDate(value) {
  if (!value) return 'Date unknown';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unknown';
  return date.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

async function loadHistory(user) {
  if (!history) return;

  if (!user) {
    history.innerHTML = '<p class="ans-history-empty">Sign in to view the alliance edict archive.</p>';
    return;
  }

  history.innerHTML = '<p class="ans-history-empty">Reading the archive...</p>';

  try {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(50));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      history.innerHTML = '<p class="ans-history-empty">No edicts have been issued yet.</p>';
      return;
    }

    history.innerHTML = snapshot.docs.map(item => {
      const data = item.data();
      return `
        <article class="ans-edic-card">
          <div class="ans-edic-head">
            <h4 class="ans-edic-title">${escapeHtml(data.title || 'Untitled edict')}</h4>
            <span class="ans-edic-meta">${escapeHtml(formatDate(data.createdAt))} · ${escapeHtml(data.senderRank || 'ANS Command')}</span>
          </div>
          <p class="ans-edic-body">${escapeHtml(data.body || '')}</p>
        </article>`;
    }).join('');
  } catch (error) {
    console.error('[ANS Command] History error:', error);
    history.innerHTML = '<p class="ans-history-empty">The edict archive could not be loaded.</p>';
  }
}

async function updateCommandAccess(user) {
  if (!commandPanel) return;

  if (!user) {
    commandPanel.style.display = 'none';
    return;
  }

  try {
    const profile = await getDoc(doc(db, 'users', user.uid));
    const rank = profile.exists() ? profile.data().rank : null;
    commandPanel.style.display = ['R4', 'R5'].includes(rank) ? '' : 'none';
  } catch (error) {
    console.error('[ANS Command] Rank check failed:', error);
    commandPanel.style.display = 'none';
  }
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    setStatus('Enter both a title and a message.', 'error');
    return;
  }

  sendButton.disabled = true;
  setStatus('Sending the edict to the entire alliance...');

  try {
    const result = await sendAnsNotification({ title, body });
    const data = result.data || {};
    setStatus(`✓ Edict sent. Devices reached: ${data.sent ?? 0}.`, 'ok');
    titleInput.value = '';
    bodyInput.value = '';
    await loadHistory(auth.currentUser);
  } catch (error) {
    console.error('[ANS Command] Send error:', error);
    const message = error?.message || '';
    if (error?.code === 'functions/permission-denied') {
      setStatus('Only R4 and R5 can issue alliance edicts.', 'error');
    } else if (message.includes('Only R4 and R5')) {
      setStatus('Only R4 and R5 can issue alliance edicts.', 'error');
    } else {
      setStatus('The edict could not be sent. Check the Firebase Function deployment.', 'error');
    }
  } finally {
    sendButton.disabled = false;
  }
});

onAuthStateChanged(auth, async user => {
  await updateCommandAccess(user);
  await loadHistory(user);
});
