import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

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

const form = document.getElementById('share-tip-form');
const titleInput = document.getElementById('share-tip-title');
const bodyInput = document.getElementById('share-tip-body');
const status = document.getElementById('share-tip-status');
const list = document.getElementById('share-tips-list');

let unsubscribe = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  "'":'&#39;',
  '"':'&quot;'
}[ch]));

function formatDate(value){
  if(!value) return 'Date pending';
  const date = value.toDate ? value.toDate() : new Date(value);
  if(Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-US', {
    year:'numeric',
    month:'long',
    day:'numeric'
  });
}

function renderTips(snapshot){
  if(snapshot.empty){
    list.innerHTML = '<p class="share-tips-empty">No tips have been shared yet. Be the first one.</p>';
    return;
  }

  list.innerHTML = snapshot.docs.map(doc => {
    const tip = doc.data();
    return `
      <article class="tip-card">
        <div class="tip-card-head">
          <h3 class="tip-card-title">${esc(tip.title || 'Alliance Tip')}</h3>
          <span class="tip-card-date">${esc(formatDate(tip.createdAt))}</span>
        </div>
        <p class="tip-card-body">${esc(tip.body || '')}</p>
        <div class="tip-card-author">Posted by <strong>${esc(tip.authorEmail || 'ANS member')}</strong></div>
      </article>
    `;
  }).join('');
}

function watchTips(){
  if(unsubscribe) unsubscribe();

  const tipsQuery = query(
    collection(db, 'tips'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  unsubscribe = onSnapshot(tipsQuery, renderTips, error => {
    console.error('[ANS Share a Tip]', error);
    list.innerHTML = '<p class="share-tips-empty error">The tips could not be loaded.</p>';
  });
}

function setLoggedState(user){
  if(!user){
    if(unsubscribe){
      unsubscribe();
      unsubscribe = null;
    }
    form?.classList.add('hidden');
    list.innerHTML = '<p class="share-tips-empty">Sign in to share a tip and view the alliance tips.</p>';
    return;
  }

  form?.classList.remove('hidden');
  watchTips();
}

form?.addEventListener('submit', async event => {
  event.preventDefault();

  const user = auth.currentUser;
  if(!user){
    status.textContent = 'Sign in before sharing a tip.';
    status.className = 'share-tip-status error';
    return;
  }

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if(!title || !body){
    status.textContent = 'Add a title and the tip before publishing.';
    status.className = 'share-tip-status error';
    return;
  }

  const button = document.getElementById('share-tip-submit');
  button.disabled = true;
  status.textContent = 'Publishing your tip...';
  status.className = 'share-tip-status';

  try{
    await addDoc(collection(db, 'tips'), {
      title,
      body,
      uid: user.uid,
      authorEmail: user.email || '',
      createdAt: serverTimestamp()
    });

    form.reset();
    status.textContent = '✓ Tip published.';
    status.className = 'share-tip-status ok';
  }catch(error){
    console.error('[ANS Share a Tip publish]', error);
    status.textContent = 'The tip could not be published. Try again.';
    status.className = 'share-tip-status error';
  }finally{
    button.disabled = false;
  }
});

onAuthStateChanged(auth, setLoggedState);
