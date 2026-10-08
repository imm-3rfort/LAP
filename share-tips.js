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
  updateDoc,
  deleteDoc,
  doc,
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
let lastSnapshot = null;   // last tips snapshot, used to re-render without waiting for Firestore
let editingId = null;      // id of the tip being edited (only one at a time)
let draft = { title:'', body:'' };
let editError = '';

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

function tipCard(id, tip, own){
  if(own && id === editingId){
    return `
      <article class="tip-card" data-id="${esc(id)}">
        <div class="tip-card-edit">
          <label class="share-tip-label" for="edit-title-${esc(id)}">Tip title</label>
          <input id="edit-title-${esc(id)}" class="share-tip-input" data-edit="title" type="text" maxlength="120" value="${esc(draft.title)}">
          <label class="share-tip-label" for="edit-body-${esc(id)}">Your tip</label>
          <textarea id="edit-body-${esc(id)}" class="share-tip-input share-tip-textarea" data-edit="body" maxlength="2000">${esc(draft.body)}</textarea>
          <p class="tip-card-msg" aria-live="polite">${esc(editError)}</p>
          <div class="tip-card-actions">
            <button type="button" class="account-btn" data-action="cancel">Cancel</button>
            <button type="button" class="account-btn primary" data-action="save">Save changes</button>
          </div>
        </div>
      </article>`;
  }

  const edited = ('editedAt' in tip)
    ? ` <span class="tip-card-edited">· Edited${tip.editedAt ? ' ' + esc(formatDate(tip.editedAt)) : ''}</span>`
    : '';

  return `
      <article class="tip-card" data-id="${esc(id)}">
        <div class="tip-card-head">
          <h3 class="tip-card-title">${esc(tip.title || 'Alliance Tip')}</h3>
          <span class="tip-card-date">${esc(formatDate(tip.createdAt))}</span>
        </div>
        <p class="tip-card-body">${esc(tip.body || '')}</p>
        <div class="tip-card-author">Posted by <strong>${esc(tip.authorEmail || 'ANS member')}</strong>${edited}</div>
        ${own ? `<div class="tip-card-actions">
          <button type="button" class="account-btn" data-action="edit">Edit</button>
          <button type="button" class="account-btn" data-action="delete">Delete</button>
        </div>` : ''}
      </article>`;
}

function renderTips(snapshot){
  lastSnapshot = snapshot;

  if(snapshot.empty){
    list.innerHTML = '<p class="share-tips-empty">No tips have been shared yet. Be the first one.</p>';
    return;
  }

  const myUid = auth.currentUser ? auth.currentUser.uid : null;
  list.innerHTML = snapshot.docs.map(d => {
    const tip = d.data();
    return tipCard(d.id, tip, !!myUid && tip.uid === myUid);
  }).join('');
}

/* Edit / delete: only the author sees the buttons (and Firestore rules enforce it) */
list.addEventListener('input', event => {
  const field = event.target.dataset ? event.target.dataset.edit : null;
  if(field) draft[field] = event.target.value;
});

list.addEventListener('click', async event => {
  const btn = event.target.closest('[data-action]');
  if(!btn) return;
  const card = btn.closest('.tip-card');
  const id = card ? card.dataset.id : null;
  if(!id) return;
  const action = btn.dataset.action;
  const snapDoc = lastSnapshot ? lastSnapshot.docs.find(d => d.id === id) : null;

  if(action === 'edit' && snapDoc){
    const tip = snapDoc.data();
    editingId = id;
    draft = { title: tip.title || '', body: tip.body || '' };
    editError = '';
    renderTips(lastSnapshot);
  }

  if(action === 'cancel'){
    editingId = null;
    editError = '';
    renderTips(lastSnapshot);
  }

  if(action === 'save'){
    const title = draft.title.trim();
    const body = draft.body.trim();
    if(!title || !body){
      editError = 'Add a title and the tip before saving.';
      renderTips(lastSnapshot);
      return;
    }
    btn.disabled = true;
    try{
      await updateDoc(doc(db, 'tips', id), { title, body, editedAt: serverTimestamp() });
      editingId = null;
      editError = '';
    }catch(error){
      console.error('[ANS Share a Tip update]', error);
      editError = 'The tip could not be updated. Try again.';
    }
    if(lastSnapshot) renderTips(lastSnapshot);
  }

  if(action === 'delete'){
    if(!window.confirm('Delete this tip? This cannot be undone.')) return;
    btn.disabled = true;
    try{
      await deleteDoc(doc(db, 'tips', id));
    }catch(error){
      console.error('[ANS Share a Tip delete]', error);
      btn.disabled = false;
      window.alert('The tip could not be deleted. Try again.');
    }
  }
});

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
    editingId = null;
    lastSnapshot = null;
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
