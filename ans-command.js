import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, collection, query, orderBy, limit, getDocs, where } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
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
const functions = getFunctions(app,'us-central1');
const panel = document.getElementById('ans-command-panel');
const form = document.getElementById('ans-command-form');
const title = document.getElementById('ans-command-title');
const body = document.getElementById('ans-command-body');
const status = document.getElementById('ans-command-status');
const history = document.getElementById('ans-command-history');

const esc = value => String(value ?? '').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

async function getMyRank(uid){
  const q=query(collection(db,'fcmTokens'),where('uid','==',uid),limit(20));
  const snap=await getDocs(q);
  for(const d of snap.docs){
    const rank=d.data().rank;
    if(['R1','R2','R3','R4','R5'].includes(rank)) return rank;
  }
  return '';
}

function formatDate(value){
  if(!value) return 'Date unavailable';
  const date=value.toDate ? value.toDate() : new Date(value);
  if(Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});
}

async function loadHistory(){
  if(!auth.currentUser){
    history.innerHTML='<p class="ans-history-empty">Sign in to view the alliance edict archive.</p>';
    return;
  }
  try{
    const q=query(collection(db,'announcements'),orderBy('createdAt','desc'),limit(30));
    const snap=await getDocs(q);
    if(snap.empty){
      history.innerHTML='<p class="ans-history-empty">No edicts have been issued yet.</p>';
      return;
    }
    history.innerHTML=snap.docs.map(doc=>{
      const d=doc.data();
      return `<article class="ans-edic"><div class="ans-edic-head"><strong>${esc(d.title || 'Untitled edict')}</strong><span>${esc(formatDate(d.createdAt))}</span></div><p class="ans-edic-body">${esc(d.body || '')}</p><div class="ans-edic-meta">${esc(d.senderRank || 'Command')} · Entire alliance</div></article>`;
    }).join('');
  }catch(error){
    console.error('[ANS Command history]',error);
    history.innerHTML='<p class="ans-history-empty">The edict archive could not be loaded.</p>';
  }
}

async function updateCommandAccess(user){
  if(!user){
    if(panel) panel.style.display='none';
    return;
  }
  try{
    const rank=await getMyRank(user.uid);
    if(panel) panel.style.display=['R4','R5'].includes(rank)?'block':'none';
  }catch(error){
    console.error('[ANS Command rank]',error);
    if(panel) panel.style.display='none';
  }
}

form?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!auth.currentUser) return;
  const edictTitle=title.value.trim();
  const edictBody=body.value.trim();
  if(!edictTitle || !edictBody) return;
  const button=document.getElementById('ans-command-send');
  button.disabled=true;
  status.textContent='Sending the edict...';
  status.className='ans-command-status';
  try{
    const send= httpsCallable(functions,'sendAnsNotification');
    const result=await send({title:edictTitle,body:edictBody});
    const data=result.data || {};
    status.textContent=`✓ Edict sent to ${data.sent ?? 0} device(s).`;
    status.className='ans-command-status ok';
    form.reset();
    await loadHistory();
  }catch(error){
    console.error('[ANS Command send]',error);
    status.textContent=error?.message || 'The edict could not be sent. Check the Firebase Function deployment.';
    status.className='ans-command-status error';
  }finally{
    button.disabled=false;
  }
});

onAuthStateChanged(auth,async user=>{
  await updateCommandAccess(user);
  if(user) await loadHistory();
  else history.innerHTML='<p class="ans-history-empty">Sign in to view the alliance edict archive.</p>';
});
