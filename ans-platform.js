/* ANS platform · core. Loaded after ans-cms.js. It only talks to index.html through the small bridge window.ANS_APP and four hooks
   (canView, route, page, after), and it lazy-loads the heavy modules so visitors never download editor code.
     ans-platform-content.js  home dashboard, bulletin, calendars, upcoming, archive, checklists, contributions, discussions, comments, search
     ans-platform-cards.js    gallery manager, Hall of Fame, Black Book, birthday photos
     ans-platform-admin.js    admin console: Menu Manager, new page/section, page manager, moderation, archive, migration tools
   Page identity (the key / "cms-<id>") never depends on where the page sits in the menu: the menu is just the tree stored in cms_nav/main. */
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import * as FS from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { esc, inline, imgAttr, safeUrl } from './ans-cms-render.js';
import * as L from './ans-logic.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCdsBBd8-TtX8T8zDFiSr5xumDwD51H0Mc', authDomain: 'lap-ans.firebaseapp.com', projectId: 'lap-ans',
  storageBucket: 'lap-ans.firebasestorage.app', messagingSenderId: '1008708931374', appId: '1:1008708931374:web:c433bbc2eade9fcfbc34bf', measurementId: 'G-4XCBZMJ6YQ'
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app), db = FS.getFirestore(app);
const A = () => window.ANS_APP;
const $ = s => document.querySelector(s);

const S = { uid: null, approved: false, isAdmin: false, isEditor: false, ready: false, tree: L.DEFAULT_NAV(), saved: false, profiles: new Map(), bm: new Map(), current: 'home', booted: false };
const isMember = () => S.approved || S.isEditor;
const roleNow = () => (isMember() ? 'member' : 'awaiting');

/* ---------- pages that are new, and their titles ---------- */
const NEW_HEADS = {
  alliance: ['The Alliance', 'The identity, history and members of ANS.'], nest: ["The Raven's Nest", 'The official information and activity center of the alliance.'],
  community: ['Community', 'Participation and collaboration.'], bulletin: ["The Raven's Bulletin", 'Official announcements of the alliance.'],
  calendars: ['ANS Calendars', 'Every date that matters.'], upcoming: ['Upcoming Events', 'What is coming next.'], archive: ['Announcements Archive', 'What the ravens carried before.'],
  checklists: ['Event Checklists', 'Track your own progress, event by event.'], 'community-tips': ['Community Tips', 'Tips shared by members and approved by the officers.'],
  suggestions: ['Suggestions', 'Help us make ANS better.'], contributions: ['Community Contributions', 'Everything members have shared with the alliance.'], discussions: ['Discussions', 'Talk with the alliance.']
};
const NEW_INTRO = {
  alliance: 'Who we are, who we remember and how we celebrate each other.', nest: 'Official news, calendars and what is coming next.',
  community: 'Share what you know, tell us what to improve and talk with the rest of the alliance.'
};
/* pages drawn by the platform modules */
const OWN = { bulletin: 'content', calendars: 'content', upcoming: 'content', archive: 'content', checklists: 'content', 'community-tips': 'content', suggestions: 'content', contributions: 'content', discussions: 'content', gallery: 'cards', 'hall-of-fame': 'cards', 'black-book': 'cards' };
const SECTION = new Set(['alliance', 'nest', 'community']);
const NO_BOOKMARK = new Set(['home', 'profile', 'settings', 'requests']);

/* ---------- tiny UI helpers shared with the modules ---------- */
const subs = [];
const watch = u => { subs.push(u); return u; };
const cleanup = () => { while (subs.length) { try { subs.pop()(); } catch { /* ignore */ } } };
function dialog(id, html, wide) {
  let d = document.getElementById(id);
  if (!d) { d = document.createElement('dialog'); d.id = id; d.className = 'modal plat-dlg'; document.body.appendChild(d); d.addEventListener('click', e => { if (e.target.closest('[data-x]')) d.close(); }); }
  d.classList.toggle('wide', !!wide); d.innerHTML = `<button class="btn close" data-x aria-label="Close">✕</button>${html}`; if (!d.open) d.showModal(); return d;
}
const toast = t => A()?.toast ? A().toast(t) : alert(t);
const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/></svg>';
const lock = (title = 'Only for ANS Members', sub = 'Log in or join ANS to open this content.', btn = true) =>
  `<div class="plat-lock">${LOCK_SVG}<b>${esc(title)}</b><span>${esc(sub)}</span>${btn && !S.uid ? '<button class="btn btn-primary" data-login="member">Log in / Become a member</button>' : ''}</div>`;
const fmtDate = ms => { try { return ms ? new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''; } catch { return ''; } };
const fmtDateTime = (ms, tz) => { try { return new Date(ms).toLocaleString('en-US', { timeZone: tz || undefined, dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };
const prof = uid => S.profiles.get(uid) || null;
const nameOf = (uid, fallback) => prof(uid)?.name || fallback || 'ANS member';
const avatar = (uid, fallback, cls = 'sm') => A().avatarHtml(prof(uid)?.photo, nameOf(uid, fallback), cls);   // current profile photo: changes propagate everywhere
const authorChip = (uid, fallbackName, label) => uid ? `<span class="author-chip">${avatar(uid, fallbackName)}<span>${label ? esc(label) + ' ' : ''}${esc(nameOf(uid, fallbackName))}</span></span>` : '';
const myName = () => prof(S.uid)?.name || auth.currentUser?.displayName || (auth.currentUser?.email || '').split('@')[0] || 'Member';
/* trusted attribution: the rules force createdBy == the signed-in uid and createdAt == the server time */
const stampNew = () => ({ createdBy: S.uid, createdByName: myName(), createdAt: FS.serverTimestamp(), lastModifiedBy: S.uid, updatedAt: FS.serverTimestamp() });
const stampEdit = () => ({ lastModifiedBy: S.uid, updatedAt: FS.serverTimestamp() });
const uid8 = () => Math.random().toString(36).slice(2, 10);
const on = (root, ev, sel, fn) => root.addEventListener(ev, e => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(t, e); });
const run = fn => async (...a) => { try { return await fn(...a); } catch (e) { console.error('[ANS platform]', e); toast('That could not be saved. You may not have permission.'); } };
const img = (src, alt = '', extra = '') => src ? `<img ${imgAttr(src)} alt="${esc(alt)}" decoding="async" loading="lazy" ${extra} onerror="this.style.visibility='hidden'">` : '';

/* images live in Firestore (cms_images), exactly like the CMS editor does it: resized in the browser, < 1 MB */
async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file is not a readable image.')); i.src = url; });
    const big = Math.max(im.naturalWidth, im.naturalHeight);
    for (const side of [1600, 1400, 1200, 1000, 800, 600]) {
      const k = Math.min(1, side / big), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      for (const q of [0.86, 0.76, 0.66, 0.55]) { const d = c.toDataURL('image/jpeg', q); if (d.length <= 820000) return { data: d, w: c.width, h: c.height }; }
    }
    throw new Error('That image is too large even after shrinking it.');
  } finally { URL.revokeObjectURL(url); }
}
async function uploadImage(file) {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPG, WEBP or GIF image.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That file is larger than 25 MB.');
  const { data, w, h } = await compress(file), ref = FS.doc(FS.collection(db, 'cms_images'));
  await FS.setDoc(ref, { data, w, h, by: S.uid || '', name: String(file.name || '').slice(0, 80), createdAt: FS.serverTimestamp() });
  return 'cms-img:' + ref.id;
}
async function pickImages(multiple) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multiple;
  const files = await new Promise(ok => { inp.onchange = () => ok([...inp.files]); inp.oncancel = () => ok([]); inp.click(); });
  const out = [];
  for (const f of files) { try { out.push(await uploadImage(f)); } catch (e) { toast(e.message && !/permission/i.test(e.message) ? e.message : 'The image could not be saved.'); break; } }
  return out;
}

/* ---------- navigation tree → the menu that index.html draws ---------- */
function ensureHeads() {
  const H = A().HEADS;
  Object.entries(NEW_HEADS).forEach(([k, v]) => { if (!H[k]) H[k] = v; });
  Object.entries(NEW_INTRO).forEach(([k, v]) => { if (!A().INTRO[k]) A().INTRO[k] = v; });
  L.walk(S.tree, n => { if (!H[n.id]) H[n.id] = [n.label, n.desc || '']; });
}
function applyTree() {
  const a = A(); if (!a) return;
  ensureHeads();
  const tup = n => [n.id, n.label, n.icon || '', (n.children || []).filter(c => !c.hidden).map(tup)];
  a.MENU.length = 0; S.tree.filter(n => !n.hidden).forEach(n => a.MENU.push(tup(n)));
  Object.keys(a.NODE).forEach(k => delete a.NODE[k]);
  L.walk(S.tree, (n, p) => { a.NODE[n.id] = { id: n.id, label: n.label, icon: n.icon || '', kids: (n.children || []).filter(c => !c.hidden).map(tup), parent: p ? p.id : null }; });
  document.body.dataset.plat = '1';
  a.buildMenu();
}
function listenNav() {
  FS.onSnapshot(FS.doc(db, 'cms_nav', 'main'), s => {
    const d = s.exists() ? s.data() : null;
    S.saved = !!(d && Array.isArray(d.items) && d.items.length);
    S.tree = S.saved ? L.sanitizeTree(d.items) : L.DEFAULT_NAV();
    if (!L.find(S.tree, 'home')) S.tree.unshift(L.DEFAULT_NAV()[0]);   // Home can never disappear
    applyTree(); P.emit('nav');
  }, err => { console.error('[ANS nav]', err); applyTree(); });
}

/* ---------- access state (mirrors index.html: approved member or editor = member) ---------- */
let unsubMember = null, unsubProfiles = null, unsubBm = null;
function userListeners() {
  unsubProfiles?.(); unsubProfiles = null; unsubBm?.(); unsubBm = null; S.bm = new Map();
  if (!S.uid || !isMember()) { P.emit('bookmarks'); return; }
  unsubProfiles = FS.onSnapshot(FS.query(FS.collection(db, 'profiles'), FS.limit(400)), s => { S.profiles = new Map(s.docs.map(d => [d.id, d.data()])); P.emit('profiles'); }, e => console.error('[ANS profiles]', e));
  unsubBm = FS.onSnapshot(FS.collection(db, 'bookmarks', S.uid, 'items'), s => { S.bm = new Map(s.docs.map(d => [d.id, d.data()])); P.emit('bookmarks'); }, e => console.error('[ANS bookmarks]', e));
}
async function resolveStaff() {
  const u = S.uid; S.isAdmin = false; S.isEditor = false;
  if (u) {
    try { S.isAdmin = (await FS.getDoc(FS.doc(db, 'admins', u))).exists(); } catch { /* not admin */ }
    try { S.isEditor = S.isAdmin || (await FS.getDoc(FS.doc(db, 'cms_editors', u))).exists(); } catch { S.isEditor = S.isAdmin; }
  }
  S.ready = true; userListeners(); paintAdminButton(); mountPage(S.current); P.emit('access');
  if (!S.booted) { S.booted = true; deep(true); }
}
onAuthStateChanged(auth, u => {
  unsubMember?.(); unsubMember = null; S.uid = u ? u.uid : null; S.approved = false;
  if (!u) { resolveStaff(); return; }
  unsubMember = FS.onSnapshot(FS.doc(db, 'members', u.uid), s => { S.approved = s.exists() && s.data().status === 'approved'; resolveStaff(); }, () => { S.approved = false; resolveStaff(); });
});

/* ---------- routing hooks (called from index.html) ---------- */
const pageToRef = p => L.refOf(p);
function canView(role, page) {
  if (page.startsWith('cms-')) { const v = L.canOpen(S.tree, role, page); return v === undefined ? (role === 'member' ? true : (cmsPageVisibility(page.slice(4)) === 'public')) : v; }
  if (page.startsWith('bulletin-')) return undefined;
  return L.canOpen(S.tree, role, page);          // undefined for pages the tree does not know (requests, profile, settings...) → index.html decides
}
const cmsPageVisibility = id => window.ANS_CMS?.visibility ? window.ANS_CMS.visibility(id) : 'members';
function route(page) {
  if (page.startsWith('cms-')) { showCms(page.slice(4)); return true; }
  if (page.startsWith('bulletin-')) { showPost(page.slice(9)); return true; }
  return false;
}
function showCms(id, tries = 0) {
  if (!window.ANS_CMS?.show) return;
  cleanup();
  if (window.ANS_CMS.has?.(id)) { window.ANS_CMS.show(id); S.current = 'cms-' + id; setTimeout(() => decorate('cms-' + id), 60); A().menuClose?.(); return; }
  if (tries < 12) { setTimeout(() => showCms(id, tries + 1), 350); return; }
  lockView(S.uid ? 'This page is not available' : 'Only for ANS Members', S.uid ? 'It may not exist, or it is reserved for approved members.' : 'Log in or join ANS to open this content.');
}
async function showPost(id) {
  cleanup(); A().menuClose?.();
  const m = await import('./ans-platform-content.js'); S.current = 'bulletin-' + id;
  m.showPost(P, id);
}
function lockView(title, sub) {
  const v = $('#view'); if (!v) return;
  v.innerHTML = A().header(title, '') + `<section class="content reveal">${lock(title, sub)}</section>`;
}
function page(key) {
  const a = A();
  if (OWN[key]) return a.header(...a.HEADS[key]) + `<section class="content reveal"><div id="plat-root" data-plat="${key}"><p class="plat-empty">Loading…</p></div></section>`;
  if (SECTION.has(key) || key.startsWith('sec-')) return a.sectionPage(key);
  return null;
}
const BOOK_ICON = 'M6 3h12v18l-6-4-6 4z';
function pageInfo(key) {
  const a = A(), h = a.HEADS[key] || [key, ''], parent = L.parentOf(S.tree, key);
  return { ref: pageToRef(key), type: 'page', title: L.find(S.tree, key)?.label || h[0], desc: h[1] || '', category: parent ? parent.label : 'ANS', thumb: '' };
}
function decorate(key) {
  if (!key || NO_BOOKMARK.has(key) || !isMember()) return;
  const head = $('#view .page-head'); if (!head || head.querySelector('.bm-btn')) return;
  const info = key.startsWith('cms-') ? window.ANS_CMS?.info?.(key.slice(4)) && { ref: L.refOf(key), type: 'cms', ...window.ANS_CMS.info(key.slice(4)), category: L.parentOf(S.tree, key)?.label || 'Pages' } : key.startsWith('bulletin-') ? P.postInfo : pageInfo(key);
  if (!info) return;
  head.insertAdjacentHTML('beforeend', bmButtonHtml(info));
}
function bmButtonHtml(info) {
  const on_ = S.bm.has(L.docIdOfRef(info.ref));
  return `<p class="plat-bar" style="margin:14px 0 0"><button class="btn bm-btn" type="button" data-bm='${esc(JSON.stringify(info))}' aria-pressed="${on_}">${on_ ? '★ Saved' : '☆ Save'}</button></p>`;
}
async function toggleBookmark(info) {
  if (!S.uid || !isMember()) return toast('Only approved members can save content.');
  const id = L.docIdOfRef(info.ref), r = FS.doc(db, 'bookmarks', S.uid, 'items', id);
  try {
    if (S.bm.has(id)) await FS.deleteDoc(r);
    else await FS.setDoc(r, { ref: info.ref, type: info.type || 'page', title: String(info.title || '').slice(0, 190), desc: String(info.desc || '').slice(0, 300), category: String(info.category || '').slice(0, 80), thumb: String(info.thumb || '').slice(0, 60), uid: S.uid, savedAt: FS.serverTimestamp() });   // doc id = stable content id → no duplicates
  } catch (e) { console.error('[ANS bookmark]', e); toast('Could not update your saved content.'); }
}
function paintBookmarkButtons() {
  document.querySelectorAll('.bm-btn').forEach(b => { try { const info = JSON.parse(b.dataset.bm), on_ = S.bm.has(L.docIdOfRef(info.ref)); b.setAttribute('aria-pressed', on_); b.textContent = on_ ? '★ Saved' : '☆ Save'; } catch { /* ignore */ } });
  if ($('#plat-saved')) renderSaved();
}
/* My profile → Saved Content (inside the existing profile page, not a second profile system) */
function savedHtml() { return `<div class="pf-card" style="margin-top:24px"><div class="section-heading"><h2><span class="symbol">⚜</span> Saved Content</h2><span class="kicker">Your private bookmarks.</span></div><div id="plat-saved"></div></div>`; }
function renderSaved() {
  const el = $('#plat-saved'); if (!el) return;
  const items = [...S.bm.values()].sort((a, b) => L.toMs(b.savedAt) - L.toMs(a.savedAt));
  if (!items.length) { el.innerHTML = '<p class="plat-empty">Nothing saved yet. Tap “☆ Save” on any guide, page or announcement.</p>'; return; }
  el.innerHTML = `<div class="saved-grid">${items.map(b => {
    const page_ = b.ref.startsWith('page:') ? b.ref.slice(5) : '', node = page_ && L.find(S.tree, page_);
    const title = node ? node.label : b.title, cat = node ? (L.parentOf(S.tree, page_)?.label || b.category) : b.category;     // stays correct if the page moves menus
    return `<article class="saved-card">${b.thumb ? img(b.thumb, '') : ''}<div class="sc-b"><span class="plat-tag">${esc(cat || 'ANS')}</span><h4>${esc(title)}</h4>${b.desc ? `<p class="meta">${esc(b.desc)}</p>` : ''}<small class="meta">Saved ${esc(fmtDate(L.toMs(b.savedAt)))}</small>
      <div class="plat-bar" style="margin:auto 0 0"><a class="btn btn-primary" href="${esc(L.hashOf(b.ref))}" data-open-ref="${esc(b.ref)}">Open</a><button class="btn" data-unsave="${esc(L.docIdOfRef(b.ref))}">Remove</button></div></div></article>`;
  }).join('')}</div>`;
}
const refToPage = ref => { const [t, ...r] = ref.split(':'), v = r.join(':'); return t === 'cms' ? 'cms-' + v : t === 'bulletin' ? 'bulletin-' + v : v; };
function go(pageKey) {
  if (pageKey.startsWith('cms-') || pageKey.startsWith('bulletin-')) { route(pageKey); history.replaceState(null, '', '#' + pageKey); return; }
  A().navigate(pageKey);
}
document.addEventListener('click', e => {
  const b = e.target.closest('.bm-btn'); if (b) { try { toggleBookmark(JSON.parse(b.dataset.bm)); } catch { /* ignore */ } return; }
  const u = e.target.closest('[data-unsave]'); if (u) { FS.deleteDoc(FS.doc(db, 'bookmarks', S.uid, 'items', u.dataset.unsave)).catch(() => toast('Could not remove it.')); return; }
  const o = e.target.closest('[data-open-ref]'); if (o) { e.preventDefault(); go(refToPage(o.dataset.openRef)); return; }
  const g = e.target.closest('[data-plat-go]'); if (g) { e.preventDefault(); go(g.dataset.platGo); }
  if (e.target.closest('#plat-search-btn')) openSearch();
  if (e.target.closest('#plat-admin-btn')) openAdmin();
});

/* ---------- after every render (called by index.html) ---------- */
function after(page_) {
  cleanup(); S.current = page_; P.postInfo = null;
  mountPage(page_);
}
function mountPage(page_) {
  if (!A()) return;
  decorate(page_);
  if (page_ === 'profile' && isMember() && !$('#plat-saved')) { $('#view .content')?.insertAdjacentHTML('beforeend', savedHtml()); renderSaved(); }
  const kind = OWN[page_];
  if (kind) { const root = $('#plat-root'); if (root && root.dataset.plat === page_) import(kind === 'cards' ? './ans-platform-cards.js' : './ans-platform-content.js').then(m => m.mount(P, page_, root)).catch(e => { console.error('[ANS platform]', e); root.innerHTML = '<p class="plat-empty">This section could not be loaded. Reload the page.</p>'; }); }
  else if (page_ === 'home') { if ($('#ans-dash')) import('./ans-platform-content.js').then(m => m.mountHome(P, $('#ans-dash'))).catch(e => console.error('[ANS home]', e)); }
  else if (page_ === 'tips' || page_ === 'birthdays' || page_ === 'about') { import(page_ === 'tips' ? './ans-platform-content.js' : './ans-platform-cards.js').then(m => m.extend?.(P, page_)).catch(e => console.error('[ANS platform]', e)); }
  if (isMember() && (page_.startsWith('guide-') || page_ === 'duel' || page_ === 'gear' || page_ === 'sanctuary' || page_ === 'server' || page_ === 'constitution') && !$('#view [data-plat-comments]')) {
    $('#view .content')?.insertAdjacentHTML('beforeend', `<div class="plat-card" style="margin-top:28px" data-plat-comments="${esc(pageToRef(page_))}"></div>`);
    import('./ans-platform-content.js').then(m => m.comments(P, $('#view [data-plat-comments]'), pageToRef(page_), 'Comments')).catch(() => {});
  }
}
function deep(initial) {
  const h = decodeURIComponent(location.hash.slice(1)); if (!h) return;
  if (h.startsWith('bulletin-') || h.startsWith('cms-')) { if (initial) { setTimeout(() => route(h), 50); } else route(h); return; }
  if (!initial && A().HEADS[h] && A().currentPage() !== h) A().navigate(h);
}
window.addEventListener('hashchange', () => { if (S.ready) deep(false); });

/* ---------- sidebar admin entry + search button ---------- */
function paintAdminButton() {
  document.getElementById('plat-admin-host')?.remove();
  const host = $('#site-menu'); if (!host || !S.isEditor) return;
  host.insertAdjacentHTML('afterend', `<div id="plat-admin-host"><button class="nav-item" id="plat-admin-btn" type="button"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></svg><span>Admin console</span></button></div>`);
}
function addSearchButton() {
  const tr = $('.top-right'); if (!tr || $('#plat-search-btn')) return;
  tr.insertAdjacentHTML('afterbegin', '<button class="btn" id="plat-search-btn" type="button" aria-label="Search the site">Search</button>');
}
const openSearch = () => import('./ans-platform-content.js').then(m => m.openSearch(P));
const openAdmin = (tab) => import('./ans-platform-admin.js').then(m => m.openConsole(P, tab));

/* ---------- the public object ---------- */
const listeners = {};
const P = window.ANS_PLATFORM = {
  db, FS, auth, S, L, esc, inline, img, imgAttr, safeUrl, A, $, on, run, watch, dialog, toast, lock, fmtDate, fmtDateTime, prof, nameOf, avatar, authorChip, myName, stampNew, stampEdit, uid8,
  isMember, isEditor: () => S.isEditor, isAdmin: () => S.isAdmin, uid: () => S.uid, uploadImage, pickImages, go, refToPage, lockView, bmButtonHtml, openAdmin, postInfo: null,
  canView, route, page, after,
  afterCms(id, p) {                                   // a CMS page was just drawn by ans-cms.js: author line, Save button, comments
    cleanup(); S.current = 'cms-' + id;
    const by = p.createdBy || p.authorId, head = $('#view .page-head');
    if (by) head?.insertAdjacentHTML('beforeend', `<p class="plat-bar" style="margin:12px 0 0">${authorChip(by, p.createdByName, 'By')}${p.lastModifiedBy && p.lastModifiedBy !== by ? `<span class="meta">· updated by ${esc(nameOf(p.lastModifiedBy))}</span>` : ''}</p>`);
    decorate('cms-' + id);
    if (isMember()) {
      $('#view .content')?.insertAdjacentHTML('beforeend', '<div class="plat-card" style="margin-top:28px" data-plat-comments="cms"></div>');
      import('./ans-platform-content.js').then(m => m.comments(P, $('#view [data-plat-comments]'), 'cms:' + id, 'Comments')).catch(() => {});
    }
  },
  subscribe(ev, fn) { (listeners[ev] = listeners[ev] || new Set()).add(fn); return () => listeners[ev].delete(fn); },
  emit(ev) { (listeners[ev] || []).forEach(f => { try { f(); } catch (e) { console.error(e); } }); if (ev === 'bookmarks') paintBookmarkButtons(); if (ev === 'profiles' && $('#plat-saved')) renderSaved(); },
  applyTree, setTree(t) { S.tree = L.sanitizeTree(t); applyTree(); }, nodeLabel: id => L.find(S.tree, id)?.label || A().HEADS[id]?.[0] || id,
  allPageIds() { return Object.keys(A().HEADS).filter(k => !['requests', 'profile', 'settings', 'knowledge'].includes(k)); }
};

/* start as soon as index.html has published its bridge (it does so synchronously, before this module runs; the wait is just a safety net) */
(function boot(n = 0) {
  if (!window.ANS_APP) { if (n < 100) setTimeout(() => boot(n + 1), 50); return; }
  ensureHeads(); applyTree(); listenNav(); addSearchButton();
})();
