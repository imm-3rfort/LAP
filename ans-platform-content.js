/* ANS platform · content module (lazy loaded). Every function receives the shared platform object P (see ans-platform.js). */
const H = (P, s) => P.esc(s);

/* =========================================================================================== */
/*  COMMENTS (reusable): guides, pages, bulletin posts, discussions. One level of replies.       */
/* =========================================================================================== */
export function comments(P, el, ref, title = 'Comments') {
  if (!el) return;
  const { db, FS, esc } = P, col = FS.collection(db, 'comments');
  let rows = [], likes = [], replyTo = null;
  el.innerHTML = `<h3>${esc(title)}</h3><div class="cmt-list"><p class="plat-empty">Loading…</p></div>
    <form class="cmt-form"><p class="plat-status" data-reply style="display:none"></p><textarea maxlength="1000" placeholder="Write a comment… (max 1000 characters)" required></textarea>
    <div class="plat-bar"><button class="btn btn-primary" type="submit">Post</button><span class="plat-status" data-st></span></div></form>`;
  const list = el.querySelector('.cmt-list'), form = el.querySelector('form'), ta = form.querySelector('textarea');
  const q = P.isEditor() ? FS.query(col, FS.where('target', '==', ref)) : FS.query(col, FS.where('target', '==', ref), FS.where('hidden', '==', false));
  const toMs = x => P.L.toMs(x);
  P.watch(FS.onSnapshot(q, s => { rows = s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })); draw(); }, e => { console.error('[ANS comments]', e); list.innerHTML = '<p class="plat-empty">Comments could not be loaded.</p>'; }));
  P.watch(FS.onSnapshot(FS.query(FS.collection(db, 'comment_reactions'), FS.where('target', '==', ref)), s => { likes = s.docs.map(d => d.data()); draw(); }, () => {}));
  function one(c, reply) {
    const mine = c.uid === P.uid(), n = likes.filter(l => l.commentId === c.id).length, liked = likes.some(l => l.commentId === c.id && l.uid === P.uid());
    return `<div class="cmt${reply ? ' cmt-reply' : ''}${c.hidden ? ' hidden-c' : ''}" data-c="${esc(c.id)}"><div class="cmt-meta">${P.authorChip(c.uid, c.name)}<span>${esc(P.fmtDate(toMs(c.createdAt)))}${c.editedAt ? ' · edited' : ''}</span>${c.hidden ? '<span class="plat-tag warn">Hidden by a moderator</span>' : ''}</div>
      <div class="cmt-body">${esc(c.text)}</div>
      <div class="cmt-act"><button class="btn" data-a="like" aria-pressed="${liked}">${liked ? '♥' : '♡'} ${n || ''}</button>${reply ? '' : '<button class="btn" data-a="reply">Reply</button>'}
      ${mine ? '<button class="btn" data-a="edit">Edit</button>' : ''}${mine || P.isEditor() ? '<button class="btn" data-a="del">Delete</button>' : ''}
      ${!mine ? '<button class="btn" data-a="report">Report</button>' : ''}${P.isEditor() ? `<button class="btn" data-a="${c.hidden ? 'show' : 'hide'}">${c.hidden ? 'Restore' : 'Hide'}</button>` : ''}</div></div>`;
}
  function draw() {
    const ids = new Set(rows.map(r => r.id)), top = rows.filter(r => !r.parentId || !ids.has(r.parentId)).sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
    list.innerHTML = top.length ? top.map(c => one(c, false) + rows.filter(r => r.parentId === c.id).sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt)).map(r => one(r, true)).join('')).join('') : '<p class="plat-empty">No comments yet. Be the first.</p>';
  }
  P.on(list, 'click', '[data-a]', P.run(async (b) => {
    const id = b.closest('[data-c]').dataset.c, c = rows.find(r => r.id === id), a = b.dataset.a, r = FS.doc(db, 'comments', id);
    if (!c) return;
    if (a === 'reply') { replyTo = c.parentId || c.id; const s = form.querySelector('[data-reply]'); s.style.display = ''; s.textContent = `Replying to ${P.nameOf(c.uid, c.name)} (tap Post, or reload to cancel)`; ta.focus(); }
    else if (a === 'edit') { const t = prompt('Edit your comment', c.text); if (t && t.trim() && t.trim() !== c.text) await FS.updateDoc(r, { text: t.trim().slice(0, 1000), editedAt: FS.serverTimestamp() }); }
    else if (a === 'del') { if (confirm('Delete this comment?')) await FS.deleteDoc(r); }
    else if (a === 'hide' || a === 'show') await FS.updateDoc(r, { hidden: a === 'hide', moderatedBy: P.uid(), moderatedAt: FS.serverTimestamp() });
    else if (a === 'like') { const rid = FS.doc(db, 'comment_reactions', id + '_' + P.uid()); if (likes.some(l => l.commentId === id && l.uid === P.uid())) await FS.deleteDoc(rid); else await FS.setDoc(rid, { commentId: id, target: ref, uid: P.uid(), createdAt: FS.serverTimestamp() }); }
    else if (a === 'report') { const reason = prompt('Why are you reporting this comment? (max 300 characters)'); if (reason && reason.trim()) { await FS.addDoc(FS.collection(db, 'comment_reports'), { commentId: id, target: ref, reporterUid: P.uid(), reason: reason.trim().slice(0, 300), status: 'open', createdAt: FS.serverTimestamp() }); P.toast('Thank you. A moderator will review it.'); } }
  }));
  form.onsubmit = P.run(async e => {
    e.preventDefault(); const text = ta.value.trim(); if (!text) return;
    form.querySelector('[data-st]').textContent = 'Posting…';
    await FS.addDoc(col, { target: ref, uid: P.uid(), name: P.myName(), text: text.slice(0, 1000), parentId: replyTo, hidden: false, createdAt: FS.serverTimestamp() });
    ta.value = ''; replyTo = null; form.querySelector('[data-reply]').style.display = 'none'; form.querySelector('[data-st]').textContent = '';
  });
}

/* =========================================================================================== */
/*  HOME DASHBOARD                                                                              */
/* =========================================================================================== */
export const DEFAULT_HOME = () => ({
  modules: [
    { id: 'quick', type: 'quick', enabled: true, title: 'Quick Access', desc: 'Jump straight to what you use most.', access: 'public', items: ['game-heroes', 'gear', 'guide-beginners', 'guide-events', 'alliance', 'bulletin'].map(p => ({ ref: 'page:' + p })) },
    { id: 'featured', type: 'featured', enabled: true, title: 'Featured Content', desc: 'Chosen by the officers.', access: 'members', items: [] },
    { id: 'month', type: 'month', enabled: true, title: 'Guide of the Month', desc: '', access: 'members', items: [] },
    { id: 'bulletin', type: 'bulletin', enabled: true, title: "The Raven's Bulletin", desc: 'Official news of the alliance.', access: 'members', items: [] },
    { id: 'upcoming', type: 'upcoming', enabled: true, title: 'Upcoming Activities', desc: 'From the ANS Calendars.', access: 'members', items: [] },
    { id: 'recent', type: 'recent', enabled: true, title: 'Recently Updated', desc: 'Fresh from the scribes.', access: 'members', items: [] },
    { id: 'community', type: 'community', enabled: true, title: 'Community Highlights', desc: 'What members are sharing.', access: 'members', items: [] }
  ]
});
export function mountHome(P, el) {
  const { db, FS } = P;
  P.watch(FS.onSnapshot(FS.doc(db, 'cms_home', 'main'), s => { renderDash(P, el, s.exists() && Array.isArray(s.data().modules) ? s.data() : DEFAULT_HOME()); }, () => renderDash(P, el, DEFAULT_HOME())));
  P.watch(P.subscribe('access', () => { if (el.isConnected) mountHome(P, el); }));
}
const refInfo = (P, ref, item = {}) => {
  const page = P.refToPage(ref), node = P.L.find(P.S.tree, page), head = P.A().HEADS[page];
  return { page, ref, title: item.label || node?.label || head?.[0] || page, desc: item.desc || head?.[1] || '', image: item.image || '' };
};
/* resolves a cms page title lazily (cms pages are not in HEADS) */
const cmsMeta = (P, ref, item) => { const id = ref.startsWith('cms:') ? ref.slice(4) : null, i = id && window.ANS_CMS?.info?.(id); return i ? { title: item.label || i.title, desc: item.desc || i.desc, image: item.image || '' } : {}; };
export async function renderDash(P, el, cfg) {
  const member = P.isMember(), { db, FS, esc, L } = P, role = member ? 'member' : 'awaiting';
  const mods = (cfg.modules || []).filter(m => m.enabled !== false);
  const shell = m => `<section class="dash-mod" data-mod="${esc(m.id)}"><h2><span class="symbol">⚜</span> ${esc(m.title)}</h2>${m.desc ? `<span class="kicker">${esc(m.desc)}</span>` : ''}<div data-body><p class="plat-empty">Loading…</p></div></section>`;
  el.innerHTML = `<div class="dash">${mods.map(shell).join('')}</div>`;
  const cardFor = (it, m) => {
    const info = { ...refInfo(P, it.ref, it), ...cmsMeta(P, it.ref, it) }, ok = it.ref.startsWith('page:') ? L.canOpen(P.S.tree, role, info.page) !== false : member;
    return ok ? `<a class="plat-card portal" href="${esc(L.hashOf(it.ref))}" data-open-ref="${esc(it.ref)}">${it.image || m.image ? `<div class="dash-cover">${P.img(it.image || m.image, '')}</div>` : ''}<h3>${esc(info.title)}</h3>${info.desc ? `<p>${esc(info.desc)}</p>` : ''}</a>`
      : `<div class="plat-card"><h3>${esc(info.title)}</h3>${P.lock('Only for ANS Members', 'Join ANS to open this content.', false)}</div>`;
  };
  const postCard = p => `<article class="plat-card">${p.image ? `<div class="dash-cover">${P.img(p.image, '')}</div>` : ''}<div class="meta">${p.pinned ? '<span class="pinned-mark">PINNED</span> ' : ''}${p.important ? '<span class="plat-tag warn">Important</span>' : ''}${esc(P.fmtDate(L.toMs(p.publishedAt || p.createdAt)))}</div><h3>${esc(p.title)}</h3><p>${esc(p.summary || '')}</p><div class="plat-bar">${P.authorChip(p.createdBy, p.createdByName)}<a class="btn" href="#bulletin-${esc(p.id)}" data-plat-go="bulletin-${esc(p.id)}">Read more</a></div></article>`;
  const get = async (name, ...cons) => (await FS.getDocs(FS.query(FS.collection(db, name), ...cons))).docs.map(d => ({ id: d.id, ...d.data() }));
  for (const m of mods) {
    const body = el.querySelector(`[data-mod="${CSS.escape(m.id)}"] [data-body]`); if (!body) continue;
    try {
      const needsMember = m.access !== 'public' || ['upcoming', 'recent', 'community'].includes(m.type);   // these read member-only records
      if (needsMember && !member) {   // visitor: an admin-written teaser only. No private record is read.
        body.innerHTML = `<div class="plat-card">${m.image ? `<div class="dash-cover">${P.img(m.image, '')}</div>` : ''}${P.lock('Only for ANS Members', 'Join ANS to see this section.')}</div>`; continue;
      }
      if (m.type === 'quick') body.innerHTML = (m.items || []).length ? `<div class="dash-quick">${m.items.map(it => { const i = refInfo(P, it.ref, it), ok = L.canOpen(P.S.tree, role, i.page) !== false; return ok ? `<button class="portal" data-plat-go="${esc(i.page)}"><h3>${esc(i.title)}</h3>${i.desc ? `<p>${esc(i.desc)}</p>` : ''}</button>` : `<div class="portal" style="opacity:.6"><h3>${esc(i.title)}</h3><p>Only for ANS Members</p></div>`; }).join('')}</div>` : '<p class="plat-empty">Nothing here yet.</p>';
      else if (m.type === 'featured') body.innerHTML = (m.items || []).length ? `<div class="dash-feat">${m.items.map(it => cardFor(it, m)).join('')}</div>` : '<p class="plat-empty">No featured content selected yet.</p>';
      else if (m.type === 'month') body.innerHTML = (m.items || [])[0] ? `<div class="dash-feat">${cardFor(m.items[0], m)}</div>` : '<p class="plat-empty">No guide selected this month.</p>';
      else if (m.type === 'bulletin') {
        const rows = (member ? await get('bulletin_posts', FS.where('status', '==', 'published'), FS.limit(40)) : await get('bulletin_posts', FS.where('status', '==', 'published'), FS.where('visibility', '==', 'public'), FS.limit(20))).filter(p => !p.archived);
        rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || L.toMs(b.publishedAt || b.createdAt) - L.toMs(a.publishedAt || a.createdAt));
        body.innerHTML = rows.length ? `<div class="dash-feat">${rows.slice(0, 3).map(postCard).join('')}</div><p><a class="btn" href="#bulletin" data-plat-go="bulletin">All announcements</a></p>` : `<p class="plat-empty">No announcements yet.</p>`;
      } else if (m.type === 'upcoming') {
        const cals = new Map((await get('cal_calendars')).map(c => [c.id, c])), ev = (await get('cal_events', FS.limit(300))).filter(e => !e.archived && cals.get(e.calendarId) && !cals.get(e.calendarId).archived).map(e => ({ ...e, startMs: e.startUtc, endMs: e.endUtc }));
        const up = L.upcoming(ev, Date.now(), 4);
        body.innerHTML = up.length ? `<div class="dash-feat">${up.map(e => eventCard(P, e, cals.get(e.calendarId), true)).join('')}</div><p><a class="btn" href="#upcoming" data-plat-go="upcoming">All upcoming events</a></p>` : '<p class="plat-empty">No upcoming activities.</p>';
      } else if (m.type === 'recent') {
        const rows = (await get('cms_pages', FS.where('status', '==', 'published'), FS.limit(60))).filter(p => !p.archived).sort((a, b) => L.toMs(b.updatedAt) - L.toMs(a.updatedAt)).slice(0, 5);
        body.innerHTML = rows.length ? `<div class="dash-feat">${rows.map(p => { const key = p.replaces || ('cms-' + p.id); return `<a class="plat-card portal" href="#${esc(key)}" data-plat-go="${esc(key)}"><div class="meta">Updated ${esc(P.fmtDate(L.toMs(p.updatedAt)))}</div><h3>${esc(p.title)}</h3><p>${esc(p.subtitle || '')}</p></a>`; }).join('')}</div>` : '<p class="plat-empty">Nothing updated recently.</p>';
      } else if (m.type === 'community') {
        const rows = (await get('contributions', FS.where('status', '==', 'published'), FS.limit(30))).sort((a, b) => L.toMs(b.publishedAt || b.createdAt) - L.toMs(a.publishedAt || a.createdAt)).slice(0, 3);
        body.innerHTML = rows.length ? `<div class="dash-feat">${rows.map(c => `<article class="plat-card"><span class="plat-tag">${esc(L.CONTRIB_TYPES[c.type] || 'Contribution')}</span><h3>${esc(c.title)}</h3><p>${esc(String(c.body).slice(0, 140))}${c.body.length > 140 ? '…' : ''}</p>${P.authorChip(c.uid, c.name, 'by')}</article>`).join('')}</div><p><a class="btn" href="#contributions" data-plat-go="contributions">All contributions</a></p>` : '<p class="plat-empty">No community highlights yet.</p>';
      }
    } catch (e) { console.error('[ANS home]', m.id, e); body.innerHTML = '<p class="plat-empty">This section could not be loaded.</p>'; }
  }
}

/* =========================================================================================== */
/*  BULLETIN                                                                                    */
/* =========================================================================================== */
const tagsOf = (P, p) => `${p.pinned ? '<span class="pinned-mark">PINNED</span> ' : ''}${p.important ? '<span class="plat-tag warn">Important</span>' : ''}${p.category ? `<span class="plat-tag">${H(P, p.category)}</span>` : ''}${p.status !== 'published' ? `<span class="plat-tag">${H(P, p.status)}</span>` : ''}${p.archived ? '<span class="plat-tag">archived</span>' : ''}`;
function loadPosts(P, cb, { archived }) {
  const { db, FS } = P, col = FS.collection(db, 'bulletin_posts');
  const q = P.isEditor() ? FS.query(col, FS.limit(300)) : FS.query(col, FS.where('status', '==', 'published'), FS.limit(300));
  return P.watch(FS.onSnapshot(q, s => {
    let rows = s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
    if (P.isEditor()) rows.filter(r => r.status === 'scheduled' && Number(r.publishAt || 0) <= Date.now()).forEach(r => FS.updateDoc(FS.doc(db, 'bulletin_posts', r.id), { status: 'published', publishedAt: FS.serverTimestamp(), ...P.stampEdit() }).catch(() => {}));
    cb(rows);
  }, e => { console.error('[ANS bulletin]', e); cb(null); }));
}
function bulletinPage(P, root, archive) {
  const { L, esc } = P; let rows = [], cat = '', showAll = false;
  const draw = () => {
    if (rows === null) { root.innerHTML = '<p class="plat-empty">The bulletin could not be loaded.</p>'; return; }
    let list = rows.filter(r => archive ? r.archived : !r.archived);
    if (!(P.isEditor() && showAll)) list = list.filter(r => r.status === 'published');
    const cats = [...new Set(rows.map(r => r.category).filter(Boolean))];
    if (cat) list = list.filter(r => r.category === cat);
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || L.toMs(b.publishedAt || b.createdAt) - L.toMs(a.publishedAt || a.createdAt));
    root.innerHTML = `<div class="plat-bar">${cats.length ? `<select data-cat><option value="">All categories</option>${cats.map(c => `<option${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
      ${P.isEditor() ? `${archive ? '' : '<button class="btn btn-primary" data-new>New announcement</button>'}<label><input type="checkbox" data-all${showAll ? ' checked' : ''}> Drafts &amp; scheduled</label>` : ''}</div>
      ${list.length ? `<div class="plat-grid">${list.map(p => `<article class="plat-card">${p.image ? P.img(p.image, '', 'class="post-thumb"') : ''}<div class="meta">${tagsOf(P, p)} ${esc(P.fmtDate(L.toMs(p.publishedAt || p.createdAt)))}${p.status === 'scheduled' ? ` · goes live ${esc(P.fmtDateTime(p.publishAt))}` : ''}</div><h3>${esc(p.title)}</h3><p>${esc(p.summary || '')}</p>
        <div class="plat-bar">${P.authorChip(p.createdBy, p.createdByName)}<a class="btn" href="#bulletin-${esc(p.id)}" data-plat-go="bulletin-${esc(p.id)}">Read more</a>${P.isEditor() ? `<button class="btn" data-edit="${esc(p.id)}">Edit</button>` : ''}</div></article>`).join('')}</div>` : `<p class="plat-empty">${archive ? 'Nothing has been archived yet.' : 'No announcements yet.'}</p>`}`;
  };
  loadPosts(P, r => { rows = r; draw(); }, { archive });
  P.on(root, 'change', '[data-cat]', t => { cat = t.value; draw(); });
  P.on(root, 'change', '[data-all]', t => { showAll = t.checked; draw(); });
  P.on(root, 'click', '[data-new]', () => postEditor(P, null, rows));
  P.on(root, 'click', '[data-edit]', t => postEditor(P, rows.find(r => r.id === t.dataset.edit), rows));
}
export async function postEditor(P, post, rows = [], onDone) {
  const { db, FS, esc, L } = P, p = post || { title: '', summary: '', body: '', category: '', image: '', link: '', linkLabel: '', visibility: 'members', pinned: false, important: false, status: 'draft', publishAt: null };
  let image = p.image || '';
  const cats = [...new Set(rows.map(r => r.category).filter(Boolean))];
  const local = ms => { if (!ms) return ''; const d = new Date(ms - new Date(ms).getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
  const d = P.dialog('plat-post', `<h2>${post ? 'Edit' : 'New'} announcement</h2><div class="plat-note">The author is recorded automatically. Posts are shown with their publication date.</div>
    <label>Title</label><input id="pp-title" maxlength="140" value="${esc(p.title)}"><label>Short description (shown on cards and on Home)</label><input id="pp-sum" maxlength="240" value="${esc(p.summary)}">
    <label>Text (blank line = new paragraph; **bold**, *italic*, [link](https://…))</label><textarea id="pp-body" rows="9" maxlength="8000">${esc(p.body)}</textarea>
    <label>Category</label><input id="pp-cat" list="pp-cats" maxlength="40" value="${esc(p.category)}"><datalist id="pp-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <label>Image</label><div class="plat-bar"><button class="btn" type="button" id="pp-img">Upload image</button><button class="btn" type="button" id="pp-noimg">Remove</button><span id="pp-prev" style="max-width:160px">${image ? P.img(image, '') : ''}</span></div>
    <label>External link (optional)</label><input id="pp-link" placeholder="https://…" value="${esc(p.link)}"><label>Link button text</label><input id="pp-linklabel" maxlength="40" value="${esc(p.linkLabel || '')}">
    <div class="plat-bar" style="margin-top:12px"><label><input type="checkbox" id="pp-pin"${p.pinned ? ' checked' : ''}> Pin to the top</label><label><input type="checkbox" id="pp-imp"${p.important ? ' checked' : ''}> Mark as important</label></div>
    <label>Visibility</label><select id="pp-vis"><option value="members"${p.visibility !== 'public' ? ' selected' : ''}>ANS members only</option><option value="public"${p.visibility === 'public' ? ' selected' : ''}>Public (also shown to visitors on Home)</option></select>
    <label>Status</label><select id="pp-status"><option value="draft"${p.status === 'draft' ? ' selected' : ''}>Draft</option><option value="published"${p.status === 'published' ? ' selected' : ''}>Published</option><option value="scheduled"${p.status === 'scheduled' ? ' selected' : ''}>Scheduled</option></select>
    <div id="pp-when" style="display:none"><label>Publish at (your local time)</label><input type="datetime-local" id="pp-at" value="${local(p.publishAt)}"></div>
    <div class="plat-bar" style="margin-top:16px"><button class="btn btn-primary" id="pp-save">Save</button><button class="btn" id="pp-preview" type="button">Preview</button>${post ? '<button class="btn" id="pp-unpub" type="button">Unpublish (back to draft)</button><button class="btn" id="pp-del" type="button">Delete</button>' : ''}<span class="plat-status" id="pp-st"></span></div><div id="pp-pv"></div>`, true);
  const $ = s => d.querySelector(s), when = () => { $('#pp-when').style.display = $('#pp-status').value === 'scheduled' ? '' : 'none'; };
  when(); $('#pp-status').onchange = when;
  $('#pp-img').onclick = async () => { $('#pp-st').textContent = 'Uploading…'; const r = await P.pickImages(false); if (r[0]) { image = r[0]; $('#pp-prev').innerHTML = P.img(image, ''); } $('#pp-st').textContent = ''; };
  $('#pp-noimg').onclick = () => { image = ''; $('#pp-prev').innerHTML = ''; };
  const read = () => {
    const status = $('#pp-status').value, at = $('#pp-at').value ? new Date($('#pp-at').value).getTime() : null;
    return { title: $('#pp-title').value.trim().slice(0, 140), summary: $('#pp-sum').value.trim().slice(0, 240), body: $('#pp-body').value.slice(0, 8000), category: $('#pp-cat').value.trim().slice(0, 40), image, link: P.safeUrl($('#pp-link').value.trim()) || '', linkLabel: $('#pp-linklabel').value.trim().slice(0, 40),
      pinned: $('#pp-pin').checked, important: $('#pp-imp').checked, visibility: $('#pp-vis').value, status, publishAt: status === 'scheduled' ? at : null };
  };
  $('#pp-preview').onclick = () => { const v = read(); $('#pp-pv').innerHTML = `<hr><div class="plat-card">${postBody(P, v, { preview: true })}</div>`; };
  $('#pp-save').onclick = P.run(async () => {
    const v = read(); if (!v.title) { $('#pp-st').textContent = 'Add a title.'; return; }
    if (v.status === 'scheduled' && (!v.publishAt || v.publishAt <= Date.now())) { if (!v.publishAt) { $('#pp-st').textContent = 'Choose the publication time.'; return; } v.status = 'published'; }
    const extra = v.status === 'published' && (!post || post.status !== 'published') ? { publishedAt: FS.serverTimestamp() } : {};
    if (post) await FS.updateDoc(FS.doc(db, 'bulletin_posts', post.id), { ...v, ...extra, ...P.stampEdit() });
    else await FS.addDoc(FS.collection(db, 'bulletin_posts'), { ...v, ...extra, archived: false, ...P.stampNew() });
    d.close(); P.toast(v.status === 'published' ? 'Published.' : 'Saved.'); onDone?.();
  });
  if (post) {
    $('#pp-unpub').onclick = P.run(async () => { await FS.updateDoc(FS.doc(db, 'bulletin_posts', post.id), { status: 'draft', ...P.stampEdit() }); d.close(); onDone?.(); });
    $('#pp-del').onclick = P.run(async () => { if (confirm('Delete this announcement for good? Use Archive to keep it in the history.')) { await FS.deleteDoc(FS.doc(db, 'bulletin_posts', post.id)); d.close(); if (location.hash.startsWith('#bulletin-')) P.go('bulletin'); onDone?.(); } });
  }
}
const paragraphs = (P, t) => String(t || '').split(/\n{2,}/).map(x => `<p>${P.inline(x).replace(/\n/g, '<br>')}</p>`).join('');
function postBody(P, p, { preview } = {}) {
  const link = p.link && P.safeUrl(p.link);
  return `${p.image ? P.img(p.image, '', 'class="post-cover"') : ''}<div class="meta">${tagsOf(P, p)}</div><h2>${H(P, p.title || 'Untitled')}</h2><p class="lead">${H(P, p.summary || '')}</p><div class="guide-body">${paragraphs(P, p.body)}</div>
   ${link ? `<p><a class="btn btn-primary" href="${H(P, link)}" target="_blank" rel="noopener">${H(P, p.linkLabel || 'Open link')}</a></p>` : ''}${preview ? '' : ''}`;
}
export async function showPost(P, id) {
  const { db, FS, esc, L } = P, v = P.A().$('#view') || document.getElementById('view');
  v.innerHTML = P.A().header('The Raven\'s Bulletin', '') + '<section class="content reveal"><p class="plat-empty">Loading…</p></section>';
  let snap; try { snap = await FS.getDoc(FS.doc(db, 'bulletin_posts', id)); } catch { return P.lockView(P.uid() ? 'This announcement is not available' : 'Only for ANS Members', 'It may be a draft, or reserved for approved members.'); }
  if (!snap.exists()) return P.lockView('Announcement not found', 'It may have been removed.');
  const p = { id, ...snap.data({ serverTimestamps: 'estimate' }) };
  history.replaceState(null, '', '#bulletin-' + id);
  P.postInfo = { ref: 'bulletin:' + id, type: 'bulletin', title: p.title, desc: p.summary || '', category: "The Raven's Bulletin", thumb: p.image || '' };
  const created = L.toMs(p.publishedAt || p.createdAt), edited = L.toMs(p.updatedAt);
  v.innerHTML = P.A().header(p.title, p.summary || '') + `<section class="content reveal"><p><a class="btn" href="#bulletin" data-plat-go="${p.archived ? 'archive' : 'bulletin'}">← Back</a></p>
   <div class="plat-bar">${P.authorChip(p.createdBy, p.createdByName, 'Posted by')}<span class="meta">${esc(P.fmtDate(created))}</span>${p.lastModifiedBy && p.lastModifiedBy !== p.createdBy && edited ? `<span class="meta">· edited by ${esc(P.nameOf(p.lastModifiedBy))} on ${esc(P.fmtDate(edited))}</span>` : ''}</div>
   ${postBody(P, p)}
   ${P.isEditor() ? `<div class="plat-bar" id="post-tools"><button class="btn" data-pt="edit">Edit</button><button class="btn" data-pt="pin">${p.pinned ? 'Unpin' : 'Pin'}</button><button class="btn" data-pt="arch">${p.archived ? 'Restore from archive' : 'Archive'}</button></div>` : ''}
   <div class="plat-card" style="margin-top:26px" id="post-comments"></div></section>`;
  document.querySelector('#view .page-head')?.insertAdjacentHTML('beforeend', P.bmButtonHtml(P.postInfo));
  if (P.isMember()) comments(P, document.getElementById('post-comments'), 'bulletin:' + id, 'Comments');
  else document.getElementById('post-comments').innerHTML = P.lock('Comments are for ANS Members', 'Log in to read and write comments.');
  document.getElementById('post-tools')?.addEventListener('click', P.run(async e => {
    const b = e.target.closest('[data-pt]'); if (!b) return; const r = FS.doc(db, 'bulletin_posts', id);
    if (b.dataset.pt === 'edit') postEditor(P, p, [], () => showPost(P, id));
    if (b.dataset.pt === 'pin') { await FS.updateDoc(r, { pinned: !p.pinned, ...P.stampEdit() }); showPost(P, id); }
    if (b.dataset.pt === 'arch') { await FS.updateDoc(r, { archived: !p.archived, ...P.stampEdit() }); showPost(P, id); }
  }));
}

/* =========================================================================================== */
/*  CALENDARS                                                                                   */
/* =========================================================================================== */
const myTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
function eventCard(P, e, cal, compact) {
  const { esc, L } = P, tz = e.tz || cal?.tz || 'UTC', mine = myTz();
  return `<article class="plat-card ev-card" style="--cc:${esc(cal?.color || '#c9a24a')}">${!compact && e.image ? P.img(e.image, '', 'class="post-thumb"') : ''}<div class="meta">${e.pinned ? '<span class="pinned-mark">PINNED</span> ' : ''}${cal ? `<span class="plat-tag">${esc(cal.name)}</span>` : ''}${e.category ? `<span class="plat-tag">${esc(e.category)}</span>` : ''}</div>
   <h3>${esc(e.title)}</h3><p class="meta">${esc(P.fmtDateTime(e.startUtc, mine))} <small>(${esc(mine)})</small><br>${tz !== mine ? esc(P.fmtDateTime(e.startUtc, tz)) + ` <small>(${esc(tz)})</small>` : ''}</p>
   ${compact ? '' : `<p>${esc(e.description || '')}</p>`}<div class="plat-bar"><button class="btn" data-ev="${esc(e.id)}">Details</button></div></article>`;
}
function eventDialog(P, e, cal) {
  const { esc, L } = P, tz = e.tz || cal?.tz || 'UTC', ev = { ...e, startMs: e.startUtc, endMs: e.endUtc };
  const d = P.dialog('plat-event', `<h2>${esc(e.title)}</h2>${e.image ? P.img(e.image, '', 'class="post-cover"') : ''}<p class="meta">${cal ? esc(cal.name) + ' · ' : ''}${esc(e.category || '')}</p>
    <p><b>Your time (${esc(myTz())}):</b> ${esc(P.fmtDateTime(e.startUtc, myTz()))} – ${esc(P.fmtDateTime(e.endUtc, myTz()))}<br><b>Event time (${esc(tz)}):</b> ${esc(P.fmtDateTime(e.startUtc, tz))} – ${esc(P.fmtDateTime(e.endUtc, tz))}</p>
    <div class="guide-body">${paragraphs(P, e.description)}</div>
    <div class="plat-bar">${e.link && P.safeUrl(e.link) ? `<a class="btn" target="_blank" rel="noopener" href="${esc(P.safeUrl(e.link))}">Event link</a>` : ''}<a class="btn" target="_blank" rel="noopener" href="${esc(L.googleLink(ev))}">Add to Google Calendar</a><button class="btn" id="ev-ics">Download .ics</button></div>`);
  d.querySelector('#ev-ics').onclick = () => download(`${L.slugify(e.title)}.ics`, L.toICS([ev], cal?.name || 'ANS'), 'text/calendar');
}
const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
function calendarsPage(P, root, upcomingOnly) {
  const { db, FS, esc, L } = P; let cals = [], evs = [], sel = new Set(), view = upcomingOnly ? 'list' : 'month', ref = new Date(), tzMode = 'mine', cf = '', q = '', showArch = false, first = true;
  const colOf = id => cals.find(c => c.id === id);
  const tz = () => tzMode === 'mine' ? myTz() : (tzMode === 'cal' ? (cals[0]?.tz || 'UTC') : tzMode);
  const visible = () => evs.filter(e => sel.has(e.calendarId) && (showArch || !e.archived) && (!cf || e.category === cf) && (!q || L.norm(e.title + ' ' + (e.description || '')).includes(L.norm(q)))).map(e => ({ ...e, startMs: e.startUtc, endMs: e.endUtc }));
  const draw = () => {
    const act = cals.filter(c => showArch || !c.archived), cats = [...new Set(evs.map(e => e.category).filter(Boolean))], z = tz(), vis = visible();
    let main = '';
    if (view === 'month') {
      const y = ref.getFullYear(), m = ref.getMonth(), g = L.groupByDay(vis, z), today = L.dayKey(Date.now(), z);
      main = `<div class="cal-head"><button class="btn" data-nav="-1">←</button><h2>${esc(ref.toLocaleString('en-US', { month: 'long', year: 'numeric' }))}</h2><button class="btn" data-nav="1">→</button><button class="btn" data-nav="0">Today</button></div>
       <div class="cal-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<div class="cal-dow">${x}</div>`).join('')}${L.monthGrid(y, m).flat().map(k => !k ? '<div class="cal-day blank"></div>' : `<div class="cal-day${k === today ? ' today' : ''}${P.isEditor() ? ' editable' : ''}" data-day="${k}"><span class="d">${+k.slice(8)}</span>${P.isEditor() ? `<button class="cal-add" data-add="${k}" aria-label="Add an event on ${k}">+</button>` : ''}${(g[k] || []).map(e => `<button class="cal-ev${e.pinned ? ' pinned' : ''}" style="--cc:${esc(colOf(e.calendarId)?.color || '#c9a24a')}" data-ev="${esc(e.id)}" title="${esc(e.title)}">${esc(L.inZone(e.startMs, z).hm)} ${esc(e.title)}</button>`).join('')}</div>`).join('')}</div>`;
    } else if (view === 'week') {
      const base = new Date(ref), ds = L.weekDays(`${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`), g = L.groupByDay(vis, z);
      main = `<div class="cal-head"><button class="btn" data-nav="-1">←</button><h2>Week of ${esc(ds[0])}</h2><button class="btn" data-nav="1">→</button><button class="btn" data-nav="0">Today</button></div><div class="cal-week">${ds.map(k => `<div class="cal-wday${P.isEditor() ? ' editable' : ''}" data-day="${k}"><h4>${esc(k)} ${P.isEditor() ? `<button class="cal-add" data-add="${k}" aria-label="Add an event on ${k}">+</button>` : ''}</h4>${(g[k] || []).map(e => `<button class="cal-ev" style="--cc:${esc(colOf(e.calendarId)?.color || '#c9a24a')};font-size:13px;white-space:normal" data-ev="${esc(e.id)}">${esc(L.inZone(e.startMs, z).hm)} · ${esc(e.title)}</button>`).join('') || '<small class="meta">—</small>'}</div>`).join('')}</div>`;
    } else {
      const list = L.upcoming(vis, Date.now(), 200);
      main = list.length ? `<div class="plat-grid">${list.map(e => eventCard(P, e, colOf(e.calendarId))).join('')}</div>` : '<p class="plat-empty">No upcoming events match.</p>';
    }
    const hint = !P.isEditor() ? '' : !cals.length ? '<p class="plat-note">Step 1: tap <b>New calendar</b>. Step 2: tap a day in the grid (or <b>New event</b>) to add an event.</p>' : upcomingOnly ? '' : '<p class="plat-note">Tap a day (or its “+”) to add an event on that date. Tap an event to see it, edit it or archive it.</p>';
    root.innerHTML = `${hint}<div class="plat-bar">${upcomingOnly ? '' : ['month', 'week', 'list'].map(v => `<button class="btn${view === v ? ' btn-primary' : ''}" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
      <select data-tz><option value="mine"${tzMode === 'mine' ? ' selected' : ''}>My time (${esc(myTz())})</option>${L.TZ_LIST.map(t => `<option value="${t}"${tzMode === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
      ${cats.length ? `<select data-cf><option value="">All categories</option>${cats.map(c => `<option${c === cf ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}<input data-q placeholder="Filter…" value="${esc(q)}" style="width:130px">
      <button class="btn" data-ics>Export .ics</button>${P.isEditor() ? `<button class="btn btn-primary" data-newev>New event</button>${upcomingOnly ? '' : '<button class="btn" data-newcal>New calendar</button><button class="btn" data-mancal>Manage calendars</button>'}<label><input type="checkbox" data-arch${showArch ? ' checked' : ''}> Archived</label>` : ''}</div>
      <div class="plat-bar">${act.map(c => `<label class="plat-tag" style="border-color:${esc(c.color || '#c9a24a')}"><input type="checkbox" data-cal="${esc(c.id)}"${sel.has(c.id) ? ' checked' : ''}> ${esc(c.name)}${c.archived ? ' (archived)' : ''}</label>`).join('') || '<span class="plat-empty">No calendars yet.</span>'}</div>${main}`;
  };
  let ready = 0; const both = () => { if (++ready >= 2 || ready >= 1 && (cals.length || evs.length)) { if (first && cals.length) { cals.filter(c => !c.archived).forEach(c => sel.add(c.id)); first = false; } draw(); } };
  P.watch(FS.onSnapshot(FS.collection(db, 'cal_calendars'), s => { cals = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); both(); }, e => { console.error(e); root.innerHTML = '<p class="plat-empty">Calendars could not be loaded.</p>'; }));
  P.watch(FS.onSnapshot(FS.query(FS.collection(db, 'cal_events'), FS.limit(600)), s => { evs = s.docs.map(d => ({ id: d.id, ...d.data() })); both(); }, () => {}));
  const gotoRef = n => { const d = new Date(ref); if (!n) ref = new Date(); else if (view === 'week') { d.setDate(d.getDate() + 7 * n); ref = d; } else { d.setDate(1); d.setMonth(d.getMonth() + n); ref = d; } };
  P.on(root, 'click', '[data-view]', t => { view = t.dataset.view; draw(); });
  P.on(root, 'click', '[data-nav]', t => { gotoRef(+t.dataset.nav); draw(); });
  P.on(root, 'click', '[data-ev]', t => { const e = evs.find(x => x.id === t.dataset.ev); if (e) { eventDialog(P, e, colOf(e.calendarId)); if (P.isEditor()) document.querySelector('#plat-event')?.insertAdjacentHTML('beforeend', `<div class="plat-bar"><button class="btn" id="ev-edit">Edit</button><button class="btn" id="ev-arch">${e.archived ? 'Restore' : 'Archive'}</button><button class="btn" id="ev-del">Delete</button></div>`); document.querySelector('#ev-edit')?.addEventListener('click', () => { document.getElementById('plat-event').close(); eventEditor(P, e, cals); }); document.querySelector('#ev-arch')?.addEventListener('click', P.run(async () => { await FS.updateDoc(FS.doc(db, 'cal_events', e.id), { archived: !e.archived, ...P.stampEdit() }); document.getElementById('plat-event').close(); })); document.querySelector('#ev-del')?.addEventListener('click', P.run(async () => { if (confirm('Delete this event? Use Archive to keep it in the history.')) { await FS.deleteDoc(FS.doc(db, 'cal_events', e.id)); document.getElementById('plat-event').close(); } })); } });
  P.on(root, 'change', '[data-cal]', t => { t.checked ? sel.add(t.dataset.cal) : sel.delete(t.dataset.cal); draw(); });
  P.on(root, 'change', '[data-tz]', t => { tzMode = t.value; draw(); });
  P.on(root, 'change', '[data-cf]', t => { cf = t.value; draw(); });
  P.on(root, 'change', '[data-arch]', t => { showArch = t.checked; draw(); });
  P.on(root, 'input', '[data-q]', t => { q = t.value; clearTimeout(t._t); t._t = setTimeout(() => { draw(); root.querySelector('[data-q]')?.focus(); }, 250); });
  P.on(root, 'click', '[data-ics]', () => download('ans-calendar.ics', L.toICS(visible(), 'ANS'), 'text/calendar'));
  P.on(root, 'click', '[data-newev]', () => eventEditor(P, null, cals));
  P.on(root, 'click', '[data-day]', (t, e) => { if (!P.isEditor() || e.target.closest('[data-ev]')) return; eventEditor(P, null, cals, t.dataset.day); });   // tap a day = new event on that date
  P.on(root, 'click', '[data-newcal]', () => calendarEditor(P, null));
  P.on(root, 'click', '[data-mancal]', () => { const d = P.dialog('plat-cals', `<h2>Calendars</h2>${cals.map(c => `<div class="plat-row"><span class="grow"><b style="color:${esc(c.color || '')}">●</b> ${esc(c.name)} ${c.archived ? '<span class="plat-tag">archived</span>' : ''}<br><small class="meta">${esc(c.tz || 'UTC')} · ${esc(c.visibility || 'members')}</small></span><button class="btn" data-e="${esc(c.id)}">Edit</button></div>`).join('') || '<p class="plat-empty">None.</p>'}`); d.onclick = e => { const b = e.target.closest('[data-e]'); if (b) { d.close(); calendarEditor(P, cals.find(c => c.id === b.dataset.e)); } }; });
}
function calendarEditor(P, c) {
  const { db, FS, esc, L } = P, x = c || { name: '', description: '', color: '#c9a24a', order: 0, visibility: 'members', archived: false, tz: 'UTC' };
  const d = P.dialog('plat-cal', `<h2>${c ? 'Edit' : 'New'} calendar</h2><label>Name</label><input id="c-n" maxlength="80" value="${esc(x.name)}"><label>Description</label><textarea id="c-d" rows="3" maxlength="400">${esc(x.description || '')}</textarea>
   <label>Colour</label><input type="color" id="c-c" value="${esc(x.color || '#c9a24a')}"><label>Display order</label><input type="number" id="c-o" value="${+x.order || 0}"><label>Time zone</label><select id="c-t">${L.TZ_LIST.map(t => `<option${t === x.tz ? ' selected' : ''}>${t}</option>`).join('')}</select>
   <label>Visibility</label><select id="c-v"><option value="members"${x.visibility !== 'public' ? ' selected' : ''}>ANS members</option><option value="public"${x.visibility === 'public' ? ' selected' : ''}>Public label</option></select><label><input type="checkbox" id="c-a"${x.archived ? ' checked' : ''}> Archived</label>
   <div class="plat-bar" style="margin-top:14px"><button class="btn btn-primary" id="c-s">Save</button>${c ? '<button class="btn" id="c-x">Delete calendar and its events</button>' : ''}</div>`);
  d.querySelector('#c-s').onclick = P.run(async () => {
    const v = { name: d.querySelector('#c-n').value.trim().slice(0, 80), description: d.querySelector('#c-d').value.trim(), color: d.querySelector('#c-c').value, order: +d.querySelector('#c-o').value || 0, tz: d.querySelector('#c-t').value, visibility: d.querySelector('#c-v').value, archived: d.querySelector('#c-a').checked };
    if (!v.name) return;
    if (c) await FS.updateDoc(FS.doc(db, 'cal_calendars', c.id), { ...v, ...P.stampEdit() }); else await FS.addDoc(FS.collection(db, 'cal_calendars'), { ...v, ...P.stampNew() }); d.close();
  });
  d.querySelector('#c-x')?.addEventListener('click', P.run(async () => {
    if (!confirm('Delete this calendar and ALL its events? Archive it instead to keep the history.')) return;
    const evs = await FS.getDocs(FS.query(FS.collection(db, 'cal_events'), FS.where('calendarId', '==', c.id))); const b = FS.writeBatch(db); evs.docs.forEach(e => b.delete(e.ref)); b.delete(FS.doc(db, 'cal_calendars', c.id)); await b.commit(); d.close();
  }));
}
function eventEditor(P, e, cals, presetDate) {
  const { db, FS, esc, L } = P; if (!cals.length) return P.toast('Create a calendar first: tap “New calendar”.');
  const tz0 = e?.tz || cals[0].tz || 'UTC', f = e ? L.inZone(e.startUtc, tz0) : null, t = e ? L.inZone(e.endUtc, tz0) : null; let image = e?.image || '';
  const d = P.dialog('plat-evedit', `<h2>${e ? 'Edit' : 'New'} event</h2><label>Calendar</label><select id="e-cal">${cals.filter(c => !c.archived || c.id === e?.calendarId).map(c => `<option value="${esc(c.id)}"${c.id === e?.calendarId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
   <label>Title</label><input id="e-t" maxlength="140" value="${esc(e?.title || '')}"><label>Description</label><textarea id="e-d" rows="4" maxlength="2000">${esc(e?.description || '')}</textarea>
   <label>Time zone the times below are in</label><select id="e-z">${L.TZ_LIST.map(z => `<option${z === tz0 ? ' selected' : ''}>${z}</option>`).join('')}</select>
   <div class="plat-bar"><div><label>Date</label><input type="date" id="e-date" value="${f ? f.key : (presetDate || '')}"></div><div><label>Starts</label><input type="time" id="e-s" value="${f ? f.hm : '18:00'}"></div><div><label>Ends</label><input type="time" id="e-e" value="${t ? t.hm : '19:00'}"></div><div><label>End date (optional)</label><input type="date" id="e-edate" value="${t && t.key !== f?.key ? t.key : ''}"></div></div>
   <label>Category</label><input id="e-c" maxlength="40" value="${esc(e?.category || '')}"><label>External link</label><input id="e-l" placeholder="https://…" value="${esc(e?.link || '')}">
   <label>Image</label><div class="plat-bar"><button class="btn" type="button" id="e-img">Upload</button><button class="btn" type="button" id="e-noimg">Remove</button><span id="e-prev" style="max-width:120px">${image ? P.img(image, '') : ''}</span></div>
   <label><input type="checkbox" id="e-pin"${e?.pinned ? ' checked' : ''}> Important / pinned</label><div class="plat-bar" style="margin-top:14px"><button class="btn btn-primary" id="e-s2">Save</button><span class="plat-status" id="e-st"></span></div>`);
  d.querySelector('#e-img').onclick = async () => { const r = await P.pickImages(false); if (r[0]) { image = r[0]; d.querySelector('#e-prev').innerHTML = P.img(image, ''); } };
  d.querySelector('#e-noimg').onclick = () => { image = ''; d.querySelector('#e-prev').innerHTML = ''; };
  d.querySelector('#e-s2').onclick = P.run(async () => {
    const q = s => d.querySelector(s).value, tz = q('#e-z'), date = q('#e-date'); if (!q('#e-t').trim() || !date) { d.querySelector('#e-st').textContent = 'Title and date are required.'; return; }
    const startUtc = L.zonedToUtc(date, q('#e-s') || '00:00', tz); let endUtc = L.zonedToUtc(q('#e-edate') || date, q('#e-e') || q('#e-s') || '00:00', tz); if (endUtc <= startUtc) endUtc = startUtc + 36e5;   // default length: 1 hour
    const v = { calendarId: q('#e-cal'), title: q('#e-t').trim().slice(0, 140), description: q('#e-d').trim(), tz, startUtc, endUtc, category: q('#e-c').trim().slice(0, 40), link: P.safeUrl(q('#e-l').trim()) || '', image, pinned: d.querySelector('#e-pin').checked, visibility: 'members', archived: e?.archived || false };
    if (e) await FS.updateDoc(FS.doc(db, 'cal_events', e.id), { ...v, ...P.stampEdit() }); else await FS.addDoc(FS.collection(db, 'cal_events'), { ...v, ...P.stampNew() }); d.close(); P.toast('Saved.');
  });
}

/* =========================================================================================== */
/*  CHECKLISTS                                                                                  */
/* =========================================================================================== */
function checklistsPage(P, root) {
  const { db, FS, esc, L } = P; let tpls = [], prog = new Map(), open = null, showArch = false;
  const draw = () => {
    const t = open && tpls.find(x => x.id === open);
    if (t) {
      const done = prog.get(t.id)?.done || {}, st = L.progress(t, done);
      root.innerHTML = `<p><button class="btn" data-back>← All checklists</button></p><div class="plat-card"><h3>${esc(t.title)}</h3><p>${esc(t.description || '')}</p><div class="chk-bar" role="progressbar" aria-valuenow="${st.pct}"><i style="width:${st.pct}%"></i></div><p class="meta">${st.done} of ${st.total} done (${st.pct}%) · saved to your account</p>
        ${(t.items || []).filter(i => !i.archived).map(i => `<label class="chk-item"><input type="checkbox" data-item="${esc(i.id)}"${done[i.id] ? ' checked' : ''}><span>${esc(i.text)}</span></label>`).join('')}
        <div class="plat-bar" style="margin-top:12px"><button class="btn" data-reset>Reset my progress</button>${P.isEditor() ? '<button class="btn" data-edit>Edit template</button>' : ''}</div></div>`;
      return;
    }
    const list = tpls.filter(x => showArch || !x.archived);
    root.innerHTML = `<div class="plat-bar">${P.isEditor() ? '<button class="btn btn-primary" data-new>New checklist</button><label><input type="checkbox" data-arch' + (showArch ? ' checked' : '') + '> Archived</label>' : ''}</div>${list.length ? `<div class="plat-grid">${list.map(x => { const s = L.progress(x, prog.get(x.id)?.done); return `<article class="plat-card"><h3>${esc(x.title)}${x.archived ? ' <span class="plat-tag">archived</span>' : ''}</h3><p>${esc(x.description || '')}</p><div class="chk-bar"><i style="width:${s.pct}%"></i></div><p class="meta">${s.done}/${s.total}</p><button class="btn btn-primary" data-open="${esc(x.id)}">Open</button></article>`; }).join('')}</div>` : '<p class="plat-empty">No checklists yet.</p>'}`;
  };
  P.watch(FS.onSnapshot(FS.collection(db, 'checklist_templates'), s => { tpls = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.title || '').localeCompare(b.title || '')); draw(); }, () => { root.innerHTML = '<p class="plat-empty">Checklists could not be loaded.</p>'; }));
  if (P.uid()) P.watch(FS.onSnapshot(FS.query(FS.collection(db, 'checklist_progress'), FS.where('uid', '==', P.uid())), s => { prog = new Map(s.docs.map(d => [d.data().templateId, d.data()])); draw(); }, () => {}));
  const pr = id => FS.doc(db, 'checklist_progress', P.uid() + '_' + id);
  P.on(root, 'click', '[data-open]', t => { open = t.dataset.open; draw(); });
  P.on(root, 'click', '[data-back]', () => { open = null; draw(); });
  P.on(root, 'change', '[data-arch]', t => { showArch = t.checked; draw(); });
  P.on(root, 'change', '[data-item]', P.run(async t => {      // only this member's own progress document is touched
    const id = t.dataset.item;
    if (t.checked) await FS.setDoc(pr(open), { uid: P.uid(), templateId: open, done: { [id]: true }, updatedAt: FS.serverTimestamp() }, { merge: true });
    else await FS.updateDoc(pr(open), { ['done.' + id]: FS.deleteField(), updatedAt: FS.serverTimestamp() });
  }));
  P.on(root, 'click', '[data-reset]', P.run(async () => { if (confirm('Clear all your ticks on this checklist?')) await FS.deleteDoc(pr(open)); }));
  P.on(root, 'click', '[data-new]', () => checklistEditor(P, null));
  P.on(root, 'click', '[data-edit]', () => checklistEditor(P, tpls.find(x => x.id === open)));
}
function checklistEditor(P, t) {
  const { db, FS, esc } = P; let items = (t?.items || []).map(i => ({ ...i }));
  const d = P.dialog('plat-chk', '');
  const draw = () => {
    d.innerHTML = `<button class="btn close" data-x>✕</button><h2>${t ? 'Edit' : 'New'} checklist</h2><div class="plat-note">Editing a template keeps each member's progress: ticks are tied to the item, not to its position or wording.</div>
    <label>Title</label><input id="k-t" maxlength="100" value="${esc(t?.title || '')}"><label>Description</label><input id="k-d" maxlength="240" value="${esc(t?.description || '')}"><h3>Tasks</h3>
    ${items.map((i, n) => `<div class="plat-row"><input class="grow" data-txt="${n}" value="${esc(i.text)}" maxlength="200"><button class="btn" data-up="${n}">↑</button><button class="btn" data-dn="${n}">↓</button><button class="btn" data-rm="${n}">Remove</button></div>`).join('')}
    <div class="plat-bar" style="margin-top:10px"><button class="btn" data-add>Add task</button></div><label><input type="checkbox" id="k-a"${t?.archived ? ' checked' : ''}> Archived</label><div class="plat-bar" style="margin-top:12px"><button class="btn btn-primary" data-save>Save</button>${t ? '<button class="btn" data-del>Delete</button>' : ''}</div>`;
  };
  draw();
  d.onclick = P.run(async e => {
    if (e.target.closest('[data-x]')) return d.close();
    const g = a => e.target.closest(`[data-${a}]`)?.dataset[a], sync = () => d.querySelectorAll('[data-txt]').forEach(i => { items[+i.dataset.txt].text = i.value; });
    if (g('add') !== undefined) { sync(); items.push({ id: P.uid8(), text: '' }); draw(); }
    else if (g('rm') !== undefined) { sync(); items.splice(+g('rm'), 1); draw(); }
    else if (g('up') !== undefined && +g('up') > 0) { sync(); const n = +g('up'); [items[n - 1], items[n]] = [items[n], items[n - 1]]; draw(); }
    else if (g('dn') !== undefined && +g('dn') < items.length - 1) { sync(); const n = +g('dn'); [items[n + 1], items[n]] = [items[n], items[n + 1]]; draw(); }
    else if (e.target.closest('[data-save]')) { sync(); const v = { title: d.querySelector('#k-t').value.trim().slice(0, 100), description: d.querySelector('#k-d').value.trim(), items: items.filter(i => i.text.trim()).map(i => ({ id: i.id, text: i.text.trim().slice(0, 200) })), archived: d.querySelector('#k-a').checked }; if (!v.title) return;
      if (t) await FS.updateDoc(FS.doc(db, 'checklist_templates', t.id), { ...v, ...P.stampEdit() }); else await FS.addDoc(FS.collection(db, 'checklist_templates'), { ...v, ...P.stampNew() }); d.close(); }
    else if (e.target.closest('[data-del]')) { if (confirm('Delete this checklist? Archive it to keep members\' progress.')) { await FS.deleteDoc(FS.doc(db, 'checklist_templates', t.id)); d.close(); } }
  });
}

/* =========================================================================================== */
/*  CONTRIBUTIONS (extends Share a Tip + Suggestions with a review workflow)                     */
/* =========================================================================================== */
function contribForm(P, fixedType) {
  const { esc, L } = P;
  return `<form class="plat-card" data-cform><h3>${fixedType === 'suggestion' ? 'Send a suggestion' : 'Submit a contribution'}</h3><p class="meta">An officer reviews it before it is published. You are credited as the author.</p>
   ${fixedType ? '' : `<label>Type</label><select name="type">${Object.entries(L.CONTRIB_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>`}
   <label>Title</label><input name="title" required maxlength="120" style="width:100%"><label>Details</label><textarea name="body" required rows="5" maxlength="4000" style="width:100%"></textarea>
   <div class="plat-bar" style="margin-top:10px"><button class="btn btn-primary" type="submit">Submit for review</button><span class="plat-status"></span></div></form>`;
}
function bindContribForm(P, root, fixedType) {
  const { db, FS } = P;
  P.on(root, 'submit', '[data-cform]', P.run(async (f, e) => {
    e.preventDefault(); const fd = new FormData(f), st = f.querySelector('.plat-status'); st.textContent = 'Sending…';
    await FS.addDoc(FS.collection(db, 'contributions'), { uid: P.uid(), name: P.myName(), type: fixedType || fd.get('type'), title: String(fd.get('title')).trim().slice(0, 120), body: String(fd.get('body')).trim().slice(0, 4000), status: 'pending', createdAt: FS.serverTimestamp() });
    f.reset(); st.textContent = 'Sent. Thank you!';
  }));
}
function contribCard(P, c, mode) {
  const { esc, L } = P;
  return `<article class="plat-card"><div class="meta"><span class="plat-tag">${esc(L.CONTRIB_TYPES[c.type] || c.type)}</span><span class="plat-tag ${c.status === 'published' ? 'ok' : c.status === 'rejected' ? 'warn' : ''}">${esc(L.STATUS[c.status] || c.status)}</span>${esc(P.fmtDate(L.toMs(c.publishedAt || c.createdAt)))}</div><h3>${esc(c.title)}</h3><p style="white-space:pre-wrap">${esc(c.body)}</p>
   ${c.reviewerNote ? `<p class="plat-note"><b>Officer note:</b> ${esc(c.reviewerNote)}</p>` : ''}<div class="plat-bar">${P.authorChip(c.uid, c.name, 'by')}
   ${mode === 'queue' ? ['review', 'approved', 'changes_requested', 'rejected', 'published'].map(s => `<button class="btn" data-st="${s}" data-id="${esc(c.id)}">${esc(L.STATUS[s])}</button>`).join('') + `<button class="btn" data-ed="${esc(c.id)}">Edit</button><button class="btn" data-rm="${esc(c.id)}">Delete</button>` : ''}
   ${mode === 'mine' && ['pending', 'changes_requested'].includes(c.status) ? `<button class="btn" data-myedit="${esc(c.id)}">Edit &amp; resubmit</button><button class="btn" data-myrm="${esc(c.id)}">Withdraw</button>` : ''}</div></article>`;
}
function contributionsPage(P, root, kind) {
  const { db, FS, esc, L } = P; let rows = [], tab = 'public', typeF = '';
  const mineQ = FS.query(FS.collection(db, 'contributions'), FS.where('uid', '==', P.uid() || '-'));
  let pub = [], mine = [], all = [];
  const draw = () => {
    const base = tab === 'queue' ? all : tab === 'mine' ? mine : pub;
    let list = base.filter(c => (kind === 'suggestions' ? c.type === 'suggestion' : true) && (!typeF || c.type === typeF)); if (tab === 'queue' && statusF) list = list.filter(c => c.status === statusF);
    list.sort((a, b) => L.toMs(b.publishedAt || b.createdAt) - L.toMs(a.publishedAt || a.createdAt));
    root.innerHTML = `${kind === 'suggestions' ? `<div class="plat-card"><h3>Any ideas?</h3><p>You can use the original form too:</p><a class="btn" target="_blank" rel="noopener" href="${esc(P.A().ideasUrl || '#')}">Open the suggestions form</a></div><div style="height:14px"></div>` : ''}${contribForm(P, kind === 'suggestions' ? 'suggestion' : null)}
     <div class="plat-bar" style="margin-top:20px"><button class="btn${tab === 'public' ? ' btn-primary' : ''}" data-tab="public">Published</button><button class="btn${tab === 'mine' ? ' btn-primary' : ''}" data-tab="mine">My submissions</button>${P.isEditor() ? `<button class="btn${tab === 'queue' ? ' btn-primary' : ''}" data-tab="queue">Review queue</button>` : ''}
     ${kind !== 'suggestions' ? `<select data-type><option value="">All types</option>${Object.entries(L.CONTRIB_TYPES).map(([k, v]) => `<option value="${k}"${typeF === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>` : ''}${tab === 'queue' ? `<select data-sf><option value="">All statuses</option>${Object.entries(L.STATUS).map(([k, v]) => `<option value="${k}"${statusF === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>` : ''}</div>
     ${list.length ? `<div class="plat-grid">${list.map(c => contribCard(P, c, tab)).join('')}</div>` : '<p class="plat-empty">Nothing here yet.</p>'}`;
  };
  let statusF = '';
  P.watch(FS.onSnapshot(FS.query(FS.collection(db, 'contributions'), FS.where('status', '==', 'published'), FS.limit(200)), s => { pub = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => {}));
  P.watch(FS.onSnapshot(mineQ, s => { mine = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => {}));
  if (P.isEditor()) P.watch(FS.onSnapshot(FS.query(FS.collection(db, 'contributions'), FS.limit(400)), s => { all = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => {}));
  bindContribForm(P, root, kind === 'suggestions' ? 'suggestion' : null);
  P.on(root, 'click', '[data-tab]', t => { tab = t.dataset.tab; draw(); });
  P.on(root, 'change', '[data-type]', t => { typeF = t.value; draw(); });
  P.on(root, 'change', '[data-sf]', t => { statusF = t.value; draw(); });
  P.on(root, 'click', '[data-st]', P.run(async t => {
    const s = t.dataset.st, ref = FS.doc(db, 'contributions', t.dataset.id), patch = { status: s, reviewedBy: P.uid(), reviewedAt: FS.serverTimestamp(), ...P.stampEdit() };
    if (s === 'changes_requested' || s === 'rejected') { const n = prompt(s === 'rejected' ? 'Reason (shown to the author)' : 'What should be changed? (shown to the author)'); if (n === null) return; patch.reviewerNote = n.slice(0, 500); }
    if (s === 'published') patch.publishedAt = FS.serverTimestamp();
    await FS.updateDoc(ref, patch);
  }));
  P.on(root, 'click', '[data-ed]', t => { const c = all.find(x => x.id === t.dataset.ed); const ti = prompt('Title', c.title); if (ti === null) return; const bo = prompt('Text', c.body); if (bo === null) return; FS.updateDoc(FS.doc(db, 'contributions', c.id), { title: ti.slice(0, 120), body: bo.slice(0, 4000), ...P.stampEdit() }).catch(() => P.toast('Not saved.')); });
  P.on(root, 'click', '[data-rm]', P.run(async t => { if (confirm('Delete this contribution?')) await FS.deleteDoc(FS.doc(db, 'contributions', t.dataset.rm)); }));
  P.on(root, 'click', '[data-myedit]', P.run(async t => { const c = mine.find(x => x.id === t.dataset.myedit), ti = prompt('Title', c.title); if (ti === null) return; const bo = prompt('Text', c.body); if (bo === null) return; await FS.updateDoc(FS.doc(db, 'contributions', c.id), { title: ti.slice(0, 120), body: bo.slice(0, 4000), status: 'pending', editedAt: FS.serverTimestamp() }); }));
  P.on(root, 'click', '[data-myrm]', P.run(async t => { if (confirm('Withdraw this submission?')) await FS.deleteDoc(FS.doc(db, 'contributions', t.dataset.myrm)); }));
}
async function communityTips(P, root) {
  const { db, FS, esc, L } = P; let pub = [], legacy = [];
  const draw = () => { const all = [...pub.map(c => ({ ...c, _t: L.toMs(c.publishedAt || c.createdAt), _l: false })), ...legacy.map(t => ({ ...t, _t: L.toMs(t.createdAt), _l: true }))].sort((a, b) => b._t - a._t);
    root.innerHTML = `<div class="plat-bar"><a class="btn btn-primary" href="#tips" data-plat-go="tips">Share a Tip</a></div>${all.length ? `<div class="plat-grid">${all.map(t => `<article class="plat-card"><div class="meta">${t._l ? '' : '<span class="plat-tag ok">Reviewed</span>'}${esc(P.fmtDate(t._t))}</div><h3>${esc(t.title)}</h3><p style="white-space:pre-wrap">${esc(t.body)}</p>${P.authorChip(t.uid, t.name || t.authorName, 'by')}</article>`).join('')}</div>` : '<p class="plat-empty">No community tips yet.</p>'}`; };
  P.watch(FS.onSnapshot(FS.query(FS.collection(db, 'contributions'), FS.where('status', '==', 'published'), FS.limit(200)), s => { pub = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.type === 'tip'); draw(); }, () => {}));
  P.watch(FS.onSnapshot(FS.query(FS.collection(db, 'tips'), FS.limit(100)), s => { legacy = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => {}));   // the original Share a Tip feed, untouched
}
export function extend(P, page) {   // Share a Tip page: add the review-queue submission under the existing instant form
  if (page !== 'tips' || !P.isMember()) return;
  const v = document.getElementById('view'); if (!v || v.querySelector('[data-tips-ext]')) return;
  const box = document.createElement('div'); box.setAttribute('data-tips-ext', ''); box.style.marginTop = '26px';
  box.innerHTML = `<div class="plat-note">Want an officer to review your idea and feature it under Community Tips? Use this form. Your name stays attached as the author.</div>${contribForm(P, null)}`;
  v.querySelector('.content')?.appendChild(box); bindContribForm(P, box, null);
}

/* =========================================================================================== */
/*  SEARCH                                                                                      */
/* =========================================================================================== */
const collect = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(x => collect(x, out)); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!/^(id|type|src|url|image|images|data)$/.test(k)) collect(x, out); }); return out; };
let indexCache = null;
async function buildIndex(P) {
  const { db, FS, L } = P, role = P.isMember() ? 'member' : 'awaiting', idx = [], a = P.A(), D = window.ANS_DATA || {}, member = P.isMember(), byPage = new Map();
  L.walk(P.S.tree, (n, p) => {
    if (L.canOpen(P.S.tree, role, n.id) === false) return;
    const e = { title: n.label, category: p ? p.label : 'ANS', text: ((a.HEADS[n.id] || [])[1] || '') + ' ' + L.stripHtml(D.guides?.[n.id] || ''), page: n.id }; idx.push(e); byPage.set(n.id, e);
  });
  if (!member) return idx;
  const get = async (n, ...c) => { try { return (await FS.getDocs(FS.query(FS.collection(db, n), ...c))).docs.map(d => ({ id: d.id, ...d.data() })); } catch { return []; } };
  const [pages, posts, evs, contribs, hof, bb] = await Promise.all([get('cms_pages', FS.where('status', '==', 'published'), FS.limit(300)), get('bulletin_posts', FS.where('status', '==', 'published'), FS.limit(200)), get('cal_events', FS.limit(300)), get('contributions', FS.where('status', '==', 'published'), FS.limit(200)), get('hof_entries', FS.limit(200)), get('blackbook_entries', FS.limit(200))]);
  pages.forEach(p => { const txt = L.stripHtml(collect(p.blocks || []).join(' ')); if (p.replaces && byPage.has(p.replaces)) byPage.get(p.replaces).text += ' ' + txt; else if (!p.replaces && !p.archived) idx.push({ title: p.title, category: L.parentOf(P.S.tree, 'cms-' + p.id)?.label || 'Pages', text: (p.subtitle || '') + ' ' + txt, page: 'cms-' + p.id }); });
  posts.filter(p => !p.archived || true).forEach(p => idx.push({ title: p.title, category: p.archived ? 'Announcements Archive' : "The Raven's Bulletin", text: (p.summary || '') + ' ' + (p.body || ''), page: 'bulletin-' + p.id }));
  evs.filter(e => !e.archived).forEach(e => idx.push({ title: e.title, category: 'ANS Calendars', text: (e.description || '') + ' ' + (e.category || ''), page: 'calendars' }));
  contribs.forEach(c => idx.push({ title: c.title, category: 'Community Contributions', text: c.body, page: c.type === 'tip' ? 'community-tips' : 'contributions' }));
  hof.forEach(h => idx.push({ title: h.title, category: 'Hall of Fame', text: (h.recipient || '') + ' ' + (h.description || ''), page: 'hall-of-fame' }));
  bb.forEach(b => idx.push({ title: b.name, category: 'Black Book', text: (b.description || '') + ' ' + (b.info || ''), page: 'black-book' }));
  return idx;
}
export async function openSearch(P) {
  const { esc, L } = P, d = P.dialog('plat-search', `<h2>Search</h2><input id="s-q" placeholder="Search heroes, guides, announcements…" autocomplete="off" style="width:100%"><div id="s-out"><p class="plat-empty">Type at least 2 letters.</p></div>`);
  const out = d.querySelector('#s-out'), inp = d.querySelector('#s-q'); inp.focus();
  const key = P.uid() + '|' + P.isMember(); if (!indexCache || indexCache.key !== key) { out.innerHTML = '<p class="plat-empty">Preparing the search…</p>'; indexCache = { key, data: await buildIndex(P) }; out.innerHTML = '<p class="plat-empty">Type at least 2 letters.</p>'; }
  inp.oninput = () => { const q = inp.value.trim(); if (q.length < 2) { out.innerHTML = '<p class="plat-empty">Type at least 2 letters.</p>'; return; } const r = L.searchIndex(indexCache.data, q);
    out.innerHTML = (r.length ? r.map((x, i) => `<button class="sr-item" data-i="${i}"><b>${esc(x.title)}</b><small>${esc(x.category)}</small><p>${esc(L.snippet(x.text, q))}</p></button>`).join('') : '<p class="plat-empty">No results.</p>') + (P.isMember() ? '' : '<p class="plat-note">Visitors can search the Game Compendium. Members can search everything.</p>'); out._r = r; };
  out.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; d.close(); const x = out._r[+b.dataset.i]; P.go(x.page); };
}

/* =========================================================================================== */
/*  DISPATCH                                                                                    */
/* =========================================================================================== */
export function mount(P, page, root) {
  if (page === 'bulletin') bulletinPage(P, root, false);
  else if (page === 'archive') bulletinPage(P, root, true);
  else if (page === 'calendars') calendarsPage(P, root, false);
  else if (page === 'upcoming') calendarsPage(P, root, true);
  else if (page === 'checklists') checklistsPage(P, root);
  else if (page === 'contributions') contributionsPage(P, root, 'contributions');
  else if (page === 'suggestions') contributionsPage(P, root, 'suggestions');
  else if (page === 'community-tips') communityTips(P, root);
  else if (page === 'discussions') { root.innerHTML = '<div class="plat-note">A friendly place to talk. Be kind: moderators can hide comments that break the alliance rules.</div><div class="plat-card" data-d></div>'; comments(P, root.querySelector('[data-d]'), 'discussion:general', 'General discussion'); }
  if (!P.isMember() && ['bulletin', 'archive', 'calendars', 'upcoming', 'checklists', 'contributions', 'suggestions', 'community-tips', 'discussions'].includes(page)) root.innerHTML = P.lock();
}
export { eventCard };
