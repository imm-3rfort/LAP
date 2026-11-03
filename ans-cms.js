/* ANS CMS · core (replaces the Stage 3 ans-cms.js).
   Collections (all new, prefix cms_):
     cms_categories/{id}  title, parentId (null = top), order, visible
     cms_pages/{id}       PUBLISHED data: title, subtitle, slug, categoryId, order, status, blocks[], replaces (null | key of a built-in page)
     cms_drafts/{id}      working copy only editors can read: title, subtitle, blocks[]
     cms_editors/{uid}    people you allow to edit (only an admin writes here)
   Owner = doc in admins/{uid}. Editor = owner OR doc in cms_editors/{uid}. Readers = approved members (members/{uid}.status == 'approved'). */
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, onSnapshot, query, where, writeBatch, addDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { esc, pageHtml, CMS_CSS, carouselInner, rawUrl, imgAttr } from './ans-cms-render.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCdsBBd8-TtX8T8zDFiSr5xumDwD51H0Mc', authDomain: 'lap-ans.firebaseapp.com', projectId: 'lap-ans',
  storageBucket: 'lap-ans.firebasestorage.app', messagingSenderId: '1008708931374',
  appId: '1:1008708931374:web:c433bbc2eade9fcfbc34bf', measurementId: 'G-4XCBZMJ6YQ'
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const slugify = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title));
const $ = s => document.querySelector(s);

let cats = [], pages = [], editors = [], approved = [];
let uid = null, isAdmin = false, isEditor = false, isMember = false, unsubs = [], unsubMember = null;
let hooks = {};                       // { openZoom, render } handed over by index.html after each render
let lastPage = null, shownCms = null, ovSig = '';
const openCats = new Set();

/* ---------- tree helpers ---------- */
const kids = pid => cats.filter(c => (c.parentId || null) === pid).sort(byOrder);
const treePages = cid => pages.filter(p => p.categoryId === cid && !p.replaces).sort(byOrder);
const overrides = () => pages.filter(p => p.replaces).sort(byOrder);
function descendants(id) {
  const out = new Set([id]); let grew = true;
  while (grew) { grew = false; cats.forEach(c => { if (c.parentId && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); grew = true; } }); }
  return out;
}
const nextOrder = list => (list.length ? Math.max(...list.map(x => x.order || 0)) + 10 : 0);
const stamp = () => serverTimestamp();

/* ---------- writes (the Firestore rules reject all of them unless the caller is an editor) ---------- */
async function addCat(parentId) {
  const title = prompt(parentId ? 'Subcategory name' : 'Category name');
  if (!title || !title.trim()) return;
  await addDoc(collection(db, 'cms_categories'), { title: title.trim().slice(0, 60), parentId: parentId || null, order: nextOrder(kids(parentId || null)), visible: true, createdBy: uid, createdAt: stamp(), updatedAt: stamp() });
  if (parentId) openCats.add(parentId);
}
async function renameCat(id) {
  const c = cats.find(x => x.id === id); const t = prompt('New name', c?.title || '');
  if (t && t.trim()) await updateDoc(doc(db, 'cms_categories', id), { title: t.trim().slice(0, 60), updatedAt: stamp() });
}
const toggleCatVisible = async id => updateDoc(doc(db, 'cms_categories', id), { visible: cats.find(x => x.id === id).visible === false, updatedAt: stamp() });
async function deleteCat(id) {
  if (kids(id).length || treePages(id).length) { alert('This category still has subcategories or pages. Move or delete them first.'); return; }
  if (confirm('Delete this empty category?')) await deleteDoc(doc(db, 'cms_categories', id));
}
async function moveCatTo(id, parentId) {
  parentId = parentId || null;
  if (parentId && descendants(id).has(parentId)) return;
  await updateDoc(doc(db, 'cms_categories', id), { parentId, order: nextOrder(kids(parentId)), updatedAt: stamp() });
  if (parentId) openCats.add(parentId);
}
async function addPage(categoryId) {
  const title = prompt('Page title');
  if (!title || !title.trim()) return;
  const t = title.trim().slice(0, 120);
  const ref = await addDoc(collection(db, 'cms_pages'), { title: t, subtitle: '', slug: slugify(t), categoryId, order: nextOrder(treePages(categoryId)), status: 'draft', replaces: null, blocks: [], authorId: uid, createdAt: stamp(), updatedAt: stamp() });
  await setDoc(doc(db, 'cms_drafts', ref.id), { title: t, subtitle: '', blocks: [], updatedAt: stamp() });
  openCats.add(categoryId);
  openEditor(ref.id);
}
async function publishPage(id) {                       // draft -> public copy
  const d = await getDoc(doc(db, 'cms_drafts', id));
  const upd = { status: 'published', publishedAt: stamp(), updatedAt: stamp() };
  if (d.exists()) { const x = d.data(); upd.blocks = x.blocks || []; upd.title = x.title; upd.subtitle = x.subtitle || ''; upd.slug = slugify(x.title); }
  await updateDoc(doc(db, 'cms_pages', id), upd);
}
const unpublishPage = id => updateDoc(doc(db, 'cms_pages', id), { status: 'draft', updatedAt: stamp() });
const togglePublish = id => (pages.find(x => x.id === id)?.status === 'published' ? unpublishPage(id) : publishPage(id));
async function duplicatePage(id) {
  const p = pages.find(x => x.id === id); if (!p) return;
  const d = await getDoc(doc(db, 'cms_drafts', id));
  const x = d.exists() ? d.data() : { title: p.title, subtitle: p.subtitle || '', blocks: p.blocks || [] };
  const title = `${x.title} (copy)`.slice(0, 120);
  const ref = await addDoc(collection(db, 'cms_pages'), { title, subtitle: x.subtitle || '', slug: slugify(title), categoryId: p.categoryId, order: nextOrder(treePages(p.categoryId)), status: 'draft', replaces: null, blocks: [], authorId: uid, createdAt: stamp(), updatedAt: stamp() });
  await setDoc(doc(db, 'cms_drafts', ref.id), { title, subtitle: x.subtitle || '', blocks: x.blocks || [], updatedAt: stamp() });
}
async function deletePage(id) {
  const p = pages.find(x => x.id === id);
  if (!confirm(p?.replaces ? 'Go back to the original built-in page? Your customized version will be deleted.' : `Delete the page "${p?.title}"? This cannot be undone.`)) return;
  await deleteDoc(doc(db, 'cms_pages', id));
  try { await deleteDoc(doc(db, 'cms_drafts', id)); } catch (e) { /* no draft */ }
}
async function movePageTo(id, categoryId) {
  if (!categoryId) return;
  await updateDoc(doc(db, 'cms_pages', id), { categoryId, order: nextOrder(treePages(categoryId)), updatedAt: stamp() });
  openCats.add(categoryId);
}
async function reorder(kind, id, dir) {
  const item = (kind === 'cat' ? cats : pages).find(x => x.id === id);
  const sibs = kind === 'cat' ? kids(item.parentId || null) : treePages(item.categoryId);
  const i = sibs.findIndex(x => x.id === id), j = i + dir;
  if (j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  const batch = writeBatch(db);
  sibs.forEach((x, n) => batch.update(doc(db, kind === 'cat' ? 'cms_categories' : 'cms_pages', x.id), { order: n * 10, updatedAt: stamp() }));
  await batch.commit();
}
const addEditor = async memberUid => { const m = approved.find(x => x.id === memberUid); if (m) await setDoc(doc(db, 'cms_editors', memberUid), { uid: memberUid, name: m.name || '', grantedBy: uid, grantedAt: stamp() }); };
const removeEditor = async memberUid => { if (confirm('Remove editing permission?')) await deleteDoc(doc(db, 'cms_editors', memberUid)); };
const run = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error('[ANS CMS]', e); alert('That change could not be saved. You may not have permission.'); } };

/* ---------- built-in pages: customize once, then edit like any other page ---------- */
/* every page of the menu except the home hero, the live pages (gallery, birthdays, members) and the personal ones can be customized */
const isBuiltin = p => !!p && !['home', 'requests', 'profile', 'settings', 'tips', 'gallery', 'birthdays', 'members'].includes(p);
/* pages a visitor without an account may read: their published customized versions are public (keep in sync with firestore.rules) */
const PUBLIC_KEYS = ['game', 'game-heroes', 'sanctuary', 'game-resources', 'game-cross', 'server', 'contact'];
async function editBuiltin(key) {
  let p = pages.find(x => x.replaces === key);
  if (!p) {
    // The current (original) page is on screen: keep its content as one editable HTML block so nothing is lost
    const v = $('#view'), sec = v?.querySelector('section.content');
    const title = v?.querySelector('.page-head h1')?.textContent || key, subtitle = v?.querySelector('.page-head p')?.textContent || '';
    const id = 'builtin-' + key;
    await setDoc(doc(db, 'cms_pages', id), { title, subtitle, slug: key, categoryId: null, order: 0, status: 'draft', replaces: key, blocks: [], authorId: uid, createdAt: stamp(), updatedAt: stamp() });
    await setDoc(doc(db, 'cms_drafts', id), { title, subtitle, blocks: [{ id: 'orig0001', type: 'html', code: sec ? sec.innerHTML : '' }], updatedAt: stamp() });
    p = { id };
  }
  openEditor(p.id);
}
async function openEditor(id) {
  try {
    const mod = await import('./ans-cms-editor.js');
    mod.openEditor(id, { db, uid, publishPage, unpublishPage });
  } catch (e) { console.error('[ANS CMS editor]', e); alert('The editor could not be loaded.'); }
}

/* ---------- public side: called by two tiny hooks in index.html ---------- */
window.ANS_CMS = {
  /* before a built-in page is drawn: if you published a customized version, use it */
  override(page) {
    const p = pages.find(x => x.replaces === page && x.status === 'published');
    return p ? pageHtml(p, p.blocks || []) : null;
  },
  /* after every render */
  after(page, ctx) {
    hooks = ctx || hooks; lastPage = page; shownCms = null;
    if (tryBoot()) return;
    ovSig = overrideSig(page);
    if (isEditor && isBuiltin(page)) addBar(page);
  }
};
const overrideSig = page => { const p = pages.find(x => x.replaces === page && x.status === 'published'); return p ? p.id + ':' + (p.updatedAt?.seconds || '') : ''; };
function addBar(page) {
  const v = $('#view'); if (!v) return;
  const custom = pages.find(x => x.replaces === page);
  v.insertAdjacentHTML('afterbegin', `<div class="cms-bar"><button class="btn" data-cms-edit="${esc(page)}">✎ Edit this page</button>${custom ? `<small class="account-sub">${custom.status === 'published' ? 'Customized version is live' : 'Customized version is a draft (visitors still see the original)'}</small>` : ''}</div>`);
}
let bootPending = true;                                   // a link like  ...#cms-<id>  opens that page once, right after loading
function tryBoot() {
  const h = location.hash;
  if (!bootPending || !h.startsWith('#cms-') || !lastPage) return false;
  if (!pages.some(p => p.id === h.slice(5))) return false;
  bootPending = false; showPage(h.slice(5)); return true;
}
function showPage(id, soft) {
  const p = pages.find(x => x.id === id), v = $('#view');
  if (!p || !v) return;
  shownCms = id;
  v.innerHTML = pageHtml(p, p.blocks || []);
  if (isEditor) v.insertAdjacentHTML('afterbegin', `<div class="cms-bar"><button class="btn" data-cms-editpage="${esc(id)}">✎ Edit this page</button><small class="account-sub">${p.status === 'published' ? 'Published' : 'Draft: only editors see this'}</small></div>`);
  document.querySelectorAll('.nav-item.active').forEach(n => n.classList.remove('active'));
  $(`#cms-nav [data-cms-page="${CSS.escape(id)}"]`)?.classList.add('active');
  history.replaceState(null, '', '#cms-' + id);          // a plain hash: shareable, and index.html does not react to replaceState
  document.title = `ANS · ${p.title} · #233`;
  if (!soft) window.scrollTo({ top: 0 });
}
/* live updates: when the data changes while someone is looking at it, redraw */
function repaint() {
  if (shownCms) { pages.some(p => p.id === shownCms) ? showPage(shownCms, true) : (shownCms = null); return; }
  if (tryBoot()) return;
  if (lastPage && overrideSig(lastPage) !== ovSig && hooks.render) hooks.render(lastPage);   // a built-in page was customized, published or reset
}

/* ---------- sidebar ---------- */
const CHEV = '<svg class="icon chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const BOOK = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h14v18H6a3 3 0 0 1 0-6h14M6 3a3 3 0 0 0-3 3v12m7-11h6m-6 4h6"/></svg>';
const GEAR = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></svg>';
function host() {
  let h = document.getElementById('cms-nav');
  if (h) return h;
  const nav = document.querySelector('.sidebar .nav'); if (!nav) return null;
  h = document.createElement('div'); h.id = 'cms-nav';
  nav.insertBefore(h, nav.querySelector('[data-page=tips]') || null);
  h.addEventListener('click', onNavClick);
  return h;
}
function renderNav() {
  const h = host(); if (!h) return;
  if (!isMember && !isEditor) { h.innerHTML = ''; return; }
  const node = c => {
    const sub = kids(c.id).filter(k => isEditor || k.visible !== false).map(node).join('');
    const items = treePages(c.id).filter(p => isEditor || p.status === 'published').map(p => `<button class="nav-item" data-cms-page="${esc(p.id)}"><span>${esc(p.title)}${p.status !== 'published' ? ' (draft)' : ''}</span></button>`).join('');
    if (!isEditor && !sub && !items) return '';
    const op = openCats.has(c.id);
    return `<button class="nav-item" data-cms-cat="${esc(c.id)}" aria-expanded="${op}">${BOOK}<span>${esc(c.title)}${c.visible === false ? ' (hidden)' : ''}</span>${CHEV}</button><div class="nav-sub"${op ? '' : ' hidden'}>${sub}${items}</div>`;
  };
  h.innerHTML = kids(null).filter(c => isEditor || c.visible !== false).map(node).join('') + (isEditor ? `<button class="nav-item" data-cms-manage="1">${GEAR}<span>Manage content</span></button>` : '');
}
function closeMobileMenu() { const b = $('#mobile-menu'); if (b && b.getAttribute('aria-expanded') === 'true') $('#veil')?.click(); }
function onNavClick(e) {
  const cat = e.target.closest('[data-cms-cat]');
  if (cat) { const id = cat.dataset.cmsCat; openCats.has(id) ? openCats.delete(id) : openCats.add(id); renderNav(); return; }
  if (e.target.closest('[data-cms-manage]')) { openManager(); closeMobileMenu(); return; }
  const pg = e.target.closest('[data-cms-page]');
  if (pg) { showPage(pg.dataset.cmsPage); closeMobileMenu(); }
}

/* ---------- block interactions on the public page (zoom, carousels, broken-image fallback) ---------- */
/* ---------- images stored in Firestore (cms_images/{id}): same idea as the profile photo, no GitHub token ---------- */
const imgCache = new Map();
const goodData = d => typeof d === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d);
function loadCmsImage(id) {
  if (!imgCache.has(id)) {
    imgCache.set(id, getDoc(doc(db, 'cms_images', id)).then(s => (s.exists() && goodData(s.data().data) ? s.data().data : ''))
      .catch(() => '').then(d => { if (!d) imgCache.delete(id); return d; }));   // failures are not cached: retried after login
  }
  return imgCache.get(id);
}
let imgTimer = 0;
function resolveImages() {
  document.querySelectorAll('img[data-cms-img]:not([data-cms-ok])').forEach(im => {
    const id = im.dataset.cmsImg; if (im.dataset.cmsBusy === id) return; im.dataset.cmsBusy = id;
    loadCmsImage(id).then(d => { delete im.dataset.cmsBusy; if (d && im.dataset.cmsImg === id) { im.src = d; im.dataset.cmsOk = '1'; } });
  });
}
const scheduleImages = () => { clearTimeout(imgTimer); imgTimer = setTimeout(resolveImages, 30); };
new MutationObserver(scheduleImages).observe(document.documentElement, { childList: true, subtree: true });
onAuthStateChanged(auth, () => setTimeout(scheduleImages, 600));
scheduleImages();
window.ANS_CMS_IMAGES = { load: loadCmsImage };

document.addEventListener('click', e => {
  const z = e.target.closest('[data-cms-zoom]');
  if (z) {
    try {
      const s = JSON.parse(z.dataset.cmsZoom);
      const open = x => hooks.openZoom ? hooks.openZoom(x) : window.open(x.src, '_blank', 'noopener');
      if (/^cms-img:/.test(s.src)) loadCmsImage(s.src.slice(8)).then(d => { if (d) open({ ...s, src: d }); });   // same zoom as every other image
      else open(s);
    } catch (err) { /* ignore */ }
    return;
  }
  const wrap = e.target.closest('[data-cms-car]');
  if (wrap) {
    const imgs = JSON.parse(wrap.dataset.imgs || '[]'); let i = +wrap.dataset.i || 0;
    if (e.target.closest('[data-cms-prev]')) i--; else if (e.target.closest('[data-cms-next]')) i++;
    else { const t = e.target.closest('[data-cms-thumb]'); if (t) i = +t.dataset.cmsThumb; else return; }
    i = ((i % imgs.length) + imgs.length) % imgs.length; wrap.dataset.i = i; wrap.innerHTML = carouselInner(imgs, i); return;
  }
  const ed = e.target.closest('[data-cms-edit]'); if (ed) { run(editBuiltin)(ed.dataset.cmsEdit); return; }
  const ep = e.target.closest('[data-cms-editpage]'); if (ep) openEditor(ep.dataset.cmsEditpage);
});
let x0 = null;                                          // swipe on carousels
document.addEventListener('pointerdown', e => { x0 = e.target.closest('[data-cms-car] .g-stage') ? e.clientX : null; });
document.addEventListener('pointerup', e => {
  const st = e.target.closest('[data-cms-car] .g-stage'); if (x0 === null || !st) return;
  const dx = e.clientX - x0; x0 = null;
  if (Math.abs(dx) > 50) st.querySelector(dx < 0 ? '[data-cms-next]' : '[data-cms-prev]')?.click();
});
/* images uploaded to GitHub take a minute to appear on Pages: until then use the raw GitHub address */
document.addEventListener('error', e => {
  const im = e.target;
  if (im && im.tagName === 'IMG' && im.dataset.raw && !im.dataset.tried) { im.dataset.tried = '1'; im.src = im.dataset.raw; }
}, true);

/* ---------- manager (editors only) ---------- */
const style = document.createElement('style');
style.textContent = CMS_CSS + `
body[data-role=signed-out] #cms-nav,body[data-role=guest] #cms-nav,body[data-role=awaiting] #cms-nav{display:none}
#cms-manager{max-width:780px;width:calc(100% - 24px);max-height:88vh;overflow:auto}
#cms-manager .cm-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-top:1px solid var(--border)}
#cms-manager .cm-name{flex:1 1 160px;min-width:0;overflow-wrap:anywhere}
#cms-manager .cm-page .cm-name{color:var(--muted-foreground)}
#cms-manager .cm-kids{margin-left:18px}
#cms-manager .btn{margin-top:0;padding:5px 9px;min-height:0;font-size:11px}
#cms-manager select{max-width:150px;background:var(--surface);color:var(--foreground);border:1px solid var(--border);padding:4px}`;
document.head.appendChild(style);

function dlg() {
  let d = document.getElementById('cms-manager'); if (d) return d;
  d = document.createElement('dialog'); d.id = 'cms-manager'; d.className = 'modal';
  d.addEventListener('click', onManagerClick); d.addEventListener('change', onManagerChange);
  document.body.appendChild(d); return d;
}
function openManager() { const d = dlg(); renderManager(); if (!d.open) d.showModal(); }
function catOptions(exceptId, selected) {
  const bad = exceptId ? descendants(exceptId) : new Set();
  const walk = (pid, depth) => kids(pid).filter(c => !bad.has(c.id)).map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${'— '.repeat(depth)}${esc(c.title)}</option>${walk(c.id, depth + 1)}`).join('');
  return walk(null, 0);
}
const B = (a, id, label) => `<button class="btn" data-a="${a}" data-id="${esc(id)}">${label}</button>`;
function managerRows(pid) {
  return kids(pid).map(c => `
    <div class="cm-row"><span class="cm-name"><b>${esc(c.title)}</b>${c.visible === false ? ' <small>(hidden)</small>' : ''}</span>
      ${B('up-cat', c.id, '↑')}${B('down-cat', c.id, '↓')}${B('ren-cat', c.id, 'Rename')}${B('sub', c.id, '+ Subcategory')}${B('page', c.id, '+ Page')}${B('vis-cat', c.id, c.visible === false ? 'Show' : 'Hide')}
      <select data-a="mv-cat" data-id="${esc(c.id)}"><option value="">Move to…</option><option value="__root">(top level)</option>${catOptions(c.id, null)}</select>${B('del-cat', c.id, 'Delete')}</div>
    <div class="cm-kids">${managerRows(c.id)}${treePages(c.id).map(p => `
      <div class="cm-row cm-page"><span class="cm-name">${esc(p.title)} <small>· ${p.status === 'published' ? 'published' : 'draft'}</small></span>
        ${B('up-page', p.id, '↑')}${B('down-page', p.id, '↓')}${B('edit', p.id, 'Edit')}${B('pub', p.id, p.status === 'published' ? 'Unpublish' : 'Publish')}${B('dup', p.id, 'Duplicate')}
        <select data-a="mv-page" data-id="${esc(p.id)}"><option value="">Move to…</option>${catOptions(null, p.categoryId)}</select>${B('del-page', p.id, 'Delete')}</div>`).join('')}</div>`).join('');
}
function renderManager() {
  const d = dlg();
  const ov = overrides().map(p => `<div class="cm-row"><span class="cm-name">${esc(p.title)} <small>· ${esc(p.replaces)} · ${p.status === 'published' ? 'live' : 'draft'}</small></span>${B('edit', p.id, 'Edit')}${B('pub', p.id, p.status === 'published' ? 'Unpublish' : 'Publish')}${B('del-page', p.id, 'Back to original')}</div>`).join('');
  const edRows = editors.map(e => `<div class="cm-row"><span class="cm-name">${esc(e.name || e.id)}</span>${B('rm-editor', e.id, 'Remove')}</div>`).join('') || '<p class="account-sub">Only you can edit for now.</p>';
  const cand = approved.filter(m => !editors.some(e => e.id === m.id) && m.id !== uid);
  const edBox = isAdmin ? `<h3>Who can edit</h3>${edRows}<div class="cm-row"><select id="cms-editor-pick"><option value="">Choose a member…</option>${cand.map(m => `<option value="${esc(m.id)}">${esc(m.name || m.email || m.id)}</option>`).join('')}</select><button class="btn" data-a="add-editor">Give permission</button></div>` : '';
  d.innerHTML = `<button class="close" data-close aria-label="Close"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
    <h2>Manage content</h2><p class="account-sub">Changes are saved to Firebase and show up for members in real time. Pages stay as drafts until you publish them. To change a built-in page (About, Gear, Guides…), open it and tap “Edit this page”.</p>
    <div class="cm-row"><button class="btn btn-primary" data-a="add-root">+ New category</button></div>
    ${managerRows(null) || '<p class="empty">No categories yet.</p>'}
    ${ov ? `<h3>Customized built-in pages</h3>${ov}` : ''}${edBox}`;
}
const actions = {
  'add-root': () => addCat(null), sub: addCat, page: addPage, 'ren-cat': renameCat, 'vis-cat': toggleCatVisible, 'del-cat': deleteCat,
  'up-cat': id => reorder('cat', id, -1), 'down-cat': id => reorder('cat', id, 1),
  edit: id => openEditor(id), pub: togglePublish, dup: duplicatePage, 'del-page': deletePage,
  'up-page': id => reorder('page', id, -1), 'down-page': id => reorder('page', id, 1), 'rm-editor': removeEditor
};
function onManagerClick(e) {
  if (e.target.closest('[data-close]')) { dlg().close(); return; }
  const b = e.target.closest('button[data-a]'); if (!b) return;
  if (b.dataset.a === 'add-editor') { const v = document.getElementById('cms-editor-pick')?.value; if (v) run(addEditor)(v); return; }
  if (b.dataset.a === 'edit') dlg().close();
  const fn = actions[b.dataset.a]; if (fn) run(fn)(b.dataset.id);
}
function onManagerChange(e) {
  const s = e.target.closest('select[data-a]'); if (!s || !s.value) return;
  if (s.dataset.a === 'mv-cat') run(moveCatTo)(s.dataset.id, s.value === '__root' ? null : s.value);
  if (s.dataset.a === 'mv-page') run(movePageTo)(s.dataset.id, s.value);
}

/* ---------- live data + access ---------- */
function refresh() { renderNav(); if (document.getElementById('cms-manager')?.open) renderManager(); repaint(); }
function stop() { unsubs.forEach(u => u()); unsubs = []; }
function listen() {
  stop();
  if (!isMember && !isEditor) {                                       // visitors and people waiting for approval: only the public pages
    cats = []; pages = [];
    const acc = {};
    PUBLIC_KEYS.forEach(k => unsubs.push(onSnapshot(query(collection(db, 'cms_pages'), where('replaces', '==', k), where('status', '==', 'published')),
      s => { acc[k] = s.docs.map(d => ({ id: d.id, ...d.data() })); pages = Object.values(acc).flat(); refresh(); }, err => console.error('[ANS CMS]', err))));
    return;
  }
  const snap = (ref, set) => onSnapshot(ref, s => { set(s.docs.map(d => ({ id: d.id, ...d.data() }))); refresh(); }, err => console.error('[ANS CMS]', err));
  unsubs.push(snap(collection(db, 'cms_categories'), v => { cats = v; }));
  unsubs.push(snap(isEditor ? collection(db, 'cms_pages') : query(collection(db, 'cms_pages'), where('status', '==', 'published')), v => { pages = v; }));
  if (isAdmin) {
    unsubs.push(snap(collection(db, 'cms_editors'), v => { editors = v; }));
    unsubs.push(snap(query(collection(db, 'members'), where('status', '==', 'approved')), v => { approved = v; }));
  }
}
async function resolveAccess(memberApproved) {
  isMember = memberApproved; isAdmin = false; isEditor = false; editors = []; approved = [];
  if (uid) {
    try { isAdmin = (await getDoc(doc(db, 'admins', uid))).exists(); } catch { isAdmin = false; }
    try { isEditor = isAdmin || (await getDoc(doc(db, 'cms_editors', uid))).exists(); } catch { isEditor = isAdmin; }
  }
  listen(); refresh();
}
onAuthStateChanged(auth, user => {
  unsubMember?.(); unsubMember = null; uid = user ? user.uid : null;
  if (!user) { resolveAccess(false); return; }
  // follow the membership status live: approving someone opens the content for them without a reload
  unsubMember = onSnapshot(doc(db, 'members', user.uid), s => resolveAccess(s.exists() && s.data().status === 'approved'), () => resolveAccess(false));
});
