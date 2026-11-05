/* ANS platform · cards module (lazy loaded): Gallery Manager, Hall of Fame, Black Book, birthday photos. */

/* real SVG artwork (no emoji) */
export const TROPHY = '<svg class="hof-trophy" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M18 8h28v15a14 14 0 0 1-28 0z" fill="currentColor" fill-opacity=".22"/><path d="M18 13H8c0 9 4 14 11 15M46 13h10c0 9-4 14-11 15"/><path d="M32 37v9"/><path d="M25 46h14l2 8H23z" fill="currentColor" fill-opacity=".22"/><path d="M22 58h20"/><path d="M32 14l2 4 4.4.6-3.2 3 .8 4.4L32 24l-4 2 .8-4.4-3.2-3 4.4-.6z" fill="currentColor" fill-opacity=".5" stroke-width="1.2"/></svg>';
export const SKULL = '<svg class="bb-skull" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5C19 5 10 14 10 27c0 7 3 12 8 15v8c0 2.5 1.5 4 4 4h20c2.5 0 4-1.5 4-4v-8c5-3 8-8 8-15C54 14 45 5 32 5z" fill="currentColor"/><ellipse cx="22.5" cy="28" rx="6.2" ry="6.8" fill="#0a0506"/><ellipse cx="41.5" cy="28" rx="6.2" ry="6.8" fill="#0a0506"/><path d="M32 34l-3.6 7.5h7.2z" fill="#0a0506"/><path d="M24.5 51v-7M32 51v-7M39.5 51v-7" stroke="#0a0506" stroke-width="2.4" stroke-linecap="round"/></svg>';
const CROSS = '<svg class="bb-x" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 12l76 76M88 12L12 88"/><circle cx="50" cy="50" r="40" stroke-width="1.5"/></svg>';
const dateAdded = (P, e) => P.fmtDate(P.L.toMs(e.createdAt));

/* =========================================================================================== */
/*  one manager for both card collections (order, drag & drop, ↑↓ for touch, edit, delete)       */
/* =========================================================================================== */
const KINDS = {
  hof: {
    col: 'hof_entries', title: 'Hall of Fame', add: 'Add entry', empty: 'No entries yet.',
    fields: [['title', 'Entry title', 'text', 120], ['recipient', 'Member or award recipient', 'text', 80], ['description', 'Description', 'area', 600], ['contributor', 'Contributor / creator (optional)', 'text', 60]],
    card: (P, e, tools) => `<article class="hof-card" data-id="${P.esc(e.id)}"${tools ? ' draggable="true"' : ''}><div class="hof-media">${e.image ? P.img(e.image, e.title, 'class="hof-img"') : ''}${TROPHY}</div>
      <div class="hof-body"><h3>${P.esc(e.title)}</h3><div class="hof-who">${P.esc(e.recipient || '')}</div><p>${P.esc(e.description || '')}</p><div class="hof-foot">Added ${P.esc(dateAdded(P, e))}${e.contributor ? ` · by ${P.esc(e.contributor)}` : e.createdBy ? ` · by ${P.esc(P.nameOf(e.createdBy, e.createdByName))}` : ''}</div></div>${tools}</article>`
  },
  bb: {
    col: 'blackbook_entries', title: 'Black Book', add: 'Add record', empty: 'The book is still empty.',
    types: { person: 'Person', alliance: 'Alliance', rival: 'Rival', other: 'Other' },
    fields: [['name', 'Name or title', 'text', 120], ['description', 'Description', 'area', 800], ['category', 'Category (optional)', 'text', 40], ['info', 'Additional information (optional)', 'area', 600]],
    card: (P, e, tools) => `<article class="bb-card" data-id="${P.esc(e.id)}"${tools ? ' draggable="true"' : ''}><div class="bb-media">${e.image ? P.img(e.image, e.name, 'class="bb-img"') : CROSS}${SKULL}</div>
      <div class="bb-body"><span class="bb-type">${P.esc(KINDS.bb.types[e.entityType] || 'Other')}</span><h3>${P.esc(e.name)}</h3>${e.category ? `<div class="meta">${P.esc(e.category)}</div>` : ''}<p>${P.esc(e.description || '')}</p>${e.info ? `<p class="meta">${P.esc(e.info)}</p>` : ''}<div class="bb-foot">Added ${P.esc(dateAdded(P, e))}</div></div>${tools}</article>`
  }
};
function cardManager(P, root, kind) {
  const { db, FS, esc } = P, K = KINDS[kind]; let rows = [], q = '', typeF = '', first = true;
  const sorted = () => [...rows].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || P.L.toMs(a.createdAt) - P.L.toMs(b.createdAt));
  const draw = () => {
    let list = sorted(); const filtering = q || typeF;
    if (q) list = list.filter(e => P.L.norm(Object.values(e).filter(v => typeof v === 'string').join(' ')).includes(P.L.norm(q)));
    if (typeF) list = list.filter(e => e.entityType === typeF);
    const ed = P.isEditor() && !filtering;
    root.innerHTML = `<div class="plat-bar">${kind === 'bb' ? `<input data-q placeholder="Search the book…" value="${esc(q)}"><select data-type><option value="">All types</option>${Object.entries(K.types).map(([k, v]) => `<option value="${k}"${typeF === k ? ' selected' : ''}>${v}</option>`).join('')}</select>` : ''}${P.isEditor() ? `<button class="btn btn-primary" data-add>${K.add}</button>` : ''}</div>
      ${P.isEditor() ? `<p class="plat-note">Editors: drag cards to reorder (desktop) or use the arrows (touch). ${filtering ? 'Clear the filter to reorder.' : ''}</p>` : ''}
      ${list.length ? `<div class="${kind}-grid">${list.map(e => K.card(P, e, P.isEditor() ? `<div class="card-tools"><button class="btn" data-ed="${esc(e.id)}">Edit</button>${ed ? `<button class="btn" data-mv="-1" data-id="${esc(e.id)}" aria-label="Move earlier">↑</button><button class="btn" data-mv="1" data-id="${esc(e.id)}" aria-label="Move later">↓</button>` : ''}<button class="btn" data-del="${esc(e.id)}">Delete</button></div>` : '')).join('')}</div>` : `<p class="plat-empty">${K.empty}</p>`}`;
  };
  P.watch(FS.onSnapshot(FS.collection(db, K.col), s => { rows = s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })); draw(); }, e => { console.error('[ANS cards]', e); root.innerHTML = '<p class="plat-empty">Could not be loaded.</p>'; }));
  const saveOrder = async ids => { const b = FS.writeBatch(db); ids.forEach((id, i) => { if (rows.find(r => r.id === id)?.order !== i) b.update(FS.doc(db, K.col, id), { order: i }); }); await b.commit(); };
  P.on(root, 'click', '[data-add]', () => editor(null));
  P.on(root, 'click', '[data-ed]', t => editor(rows.find(r => r.id === t.dataset.ed)));
  P.on(root, 'click', '[data-del]', P.run(async t => { if (confirm('Delete this card?')) await FS.deleteDoc(FS.doc(db, K.col, t.dataset.del)); }));
  P.on(root, 'click', '[data-mv]', P.run(async t => { const ids = sorted().map(r => r.id), i = ids.indexOf(t.dataset.id), j = i + +t.dataset.mv; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; await saveOrder(ids); }));
  P.on(root, 'input', '[data-q]', t => { q = t.value; clearTimeout(t._t); t._t = setTimeout(() => { draw(); root.querySelector('[data-q]')?.focus(); }, 250); });
  P.on(root, 'change', '[data-type]', t => { typeF = t.value; draw(); });
  let dragId = null;                                                   // desktop drag & drop
  root.addEventListener('dragstart', e => { const c = e.target.closest('[draggable=true]'); if (!c) return; dragId = c.dataset.id; c.classList.add('dnd-drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch { /* ignore */ } });
  root.addEventListener('dragover', e => { const c = e.target.closest('[draggable=true]'); if (c && dragId) { e.preventDefault(); root.querySelectorAll('.dnd-over').forEach(x => x.classList.remove('dnd-over')); c.classList.add('dnd-over'); } });
  root.addEventListener('dragend', () => { dragId = null; root.querySelectorAll('.dnd-over,.dnd-drag').forEach(x => x.classList.remove('dnd-over', 'dnd-drag')); });
  root.addEventListener('drop', P.run(async e => { const c = e.target.closest('[draggable=true]'); if (!c || !dragId) return; e.preventDefault(); const ids = P.L.reorderIds(sorted(), dragId, c.dataset.id); dragId = null; await saveOrder(ids); }));
  function editor(e) {
    let image = e?.image || '', type = e?.entityType || 'person';
    const f = K.fields.map(([k, label, kindF, max]) => `<label>${label}</label>${kindF === 'area' ? `<textarea data-f="${k}" rows="4" maxlength="${max}">${esc(e?.[k] || '')}</textarea>` : `<input data-f="${k}" maxlength="${max}" value="${esc(e?.[k] || '')}">`}`).join('');
    const d = P.dialog('plat-card-ed', `<h2>${e ? 'Edit' : 'New'} ${K.title} card</h2>${kind === 'bb' ? `<label>Entity type</label><select data-f="entityType">${Object.entries(K.types).map(([k, v]) => `<option value="${k}"${k === type ? ' selected' : ''}>${v}</option>`).join('')}</select>` : ''}${f}
      <label>Image (optional)</label><div class="plat-bar"><button class="btn" type="button" data-img>Upload / replace image</button><button class="btn" type="button" data-noimg>Remove image</button><span class="plat-status" data-st></span></div>
      <h3>Preview</h3><div class="${kind}-grid" style="grid-template-columns:minmax(0,300px)" data-prev></div><div class="plat-bar" style="margin-top:14px"><button class="btn btn-primary" data-save>Save</button></div>`, true);
    const read = () => { const v = { image }; d.querySelectorAll('[data-f]').forEach(i => { v[i.dataset.f] = i.value.trim(); }); return v; };
    const prev = () => { d.querySelector('[data-prev]').innerHTML = K.card(P, { id: 'x', createdAt: e?.createdAt || Date.now(), createdBy: e?.createdBy || P.uid(), ...read() }, ''); };
    prev(); d.addEventListener('input', prev);
    d.querySelector('[data-img]').onclick = async () => { d.querySelector('[data-st]').textContent = 'Uploading…'; const r = await P.pickImages(false); if (r[0]) image = r[0]; d.querySelector('[data-st]').textContent = ''; prev(); };
    d.querySelector('[data-noimg]').onclick = () => { image = ''; prev(); };
    d.querySelector('[data-save]').onclick = P.run(async () => {
      const v = read(), main = kind === 'hof' ? v.title : v.name; if (!main) { d.querySelector('[data-st]').textContent = 'The title is required.'; return; }
      if (e) await FS.updateDoc(FS.doc(db, K.col, e.id), { ...v, ...P.stampEdit() });
      else await FS.addDoc(FS.collection(db, K.col), { ...v, order: rows.length, ...P.stampNew() });
      d.close(); P.toast('Saved.');
    });
  }
}

/* =========================================================================================== */
/*  GALLERY                                                                                     */
/* =========================================================================================== */
function lightbox(P, items, i) {
  const { esc } = P, d = P.dialog('plat-lb', '', true); let n = i;
  const draw = () => { const it = items[n]; d.innerHTML = `<button class="btn close" data-x aria-label="Close">✕</button><div class="g-slide"><div class="stage">${P.img(it.src, it.caption)}</div><button class="nav-b prev" data-s="-1" aria-label="Previous">‹</button><button class="nav-b next" data-s="1" aria-label="Next">›</button><p class="cap">${esc(it.caption || '')}${it.desc ? `<br><small>${esc(it.desc)}</small>` : ''}</p></div>`; };
  draw(); d.onclick = e => { const b = e.target.closest('[data-s]'); if (b) { n = (n + +b.dataset.s + items.length) % items.length; draw(); } else if (e.target.closest('[data-x]')) d.close(); };
  d.onkeydown = e => { if (e.key === 'ArrowLeft') { n = (n - 1 + items.length) % items.length; draw(); } if (e.key === 'ArrowRight') { n = (n + 1) % items.length; draw(); } };
}
function galleryPage(P, root) {
  const { db, FS, esc } = P; let cfg = null, cat = '', idx = 0, tx = null;
  const legacy = () => (P.A().galleryItems?.() || []).map((x, i) => ({ id: 'old' + i, src: x.src, caption: x.caption || '', desc: '', category: '', tags: [], cover: i === 0 && false }));
  const items = () => cfg && cfg.items ? cfg.items : legacy();
  const mode = () => cfg?.mode || 'wall';
  let tries = 0;
  const draw = () => {
    if (!cfg && !legacy().length && tries++ < 8) { root.innerHTML = '<p class="plat-empty">Loading the gallery…</p>'; setTimeout(() => { if (root.isConnected) draw(); }, 700); return; }   // the legacy list (gallery-images.js) loads in the background
    let list = items(); const cats = [...new Set(list.map(x => x.category).filter(Boolean))]; if (cat) list = list.filter(x => x.category === cat);
    const cover = list.findIndex(x => x.cover); if (cover > 0) list = [list[cover], ...list.filter((_, i) => i !== cover)];
    root.innerHTML = `<div class="plat-bar">${cats.length ? `<button class="btn${!cat ? ' btn-primary' : ''}" data-cat="">All</button>${cats.map(c => `<button class="btn${cat === c ? ' btn-primary' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}` : ''}${P.isEditor() ? '<button class="btn btn-primary" data-manage>Gallery Manager</button>' : ''}</div>
      ${!list.length ? '<p class="plat-empty">No images yet.</p>' : mode() === 'carousel' ? slide(list) : `<div class="g-masonry">${list.map((x, i) => `<button class="mi" data-lb="${i}" aria-label="Open ${esc(x.caption || 'image')}">${P.img(x.src, x.caption)}${cfg?.captions !== false && x.caption ? `<span>${esc(x.caption)}</span>` : ''}</button>`).join('')}</div>`}`;
    root._list = list;
  };
  const slide = list => { idx = Math.min(idx, list.length - 1); const x = list[idx]; return `<div class="g-slide"><div class="stage" data-stage>${P.img(x.src, x.caption)}</div><button class="nav-b prev" data-s="-1" aria-label="Previous image">‹</button><button class="nav-b next" data-s="1" aria-label="Next image">›</button>${cfg?.captions !== false ? `<p class="cap">${esc(x.caption || '')} <small>${idx + 1}/${list.length}</small></p>` : ''}</div>`; };
  P.watch(FS.onSnapshot(FS.doc(db, 'cms_gallery', 'main'), s => { cfg = s.exists() ? s.data() : null; draw(); }, () => { cfg = null; draw(); }));
  P.on(root, 'click', '[data-cat]', t => { cat = t.dataset.cat; idx = 0; draw(); });
  P.on(root, 'click', '[data-lb]', t => lightbox(P, root._list, +t.dataset.lb));
  P.on(root, 'click', '[data-s]', t => { const n = root._list.length; idx = (idx + +t.dataset.s + n) % n; draw(); });
  root.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => { if (tx == null || !e.target.closest('[data-stage]')) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 40) { const n = root._list.length; idx = (idx + (dx < 0 ? 1 : -1) + n) % n; draw(); } }, { passive: true });
  P.on(root, 'click', '[data-manage]', () => galleryManager(P, cfg, items()));
}
function galleryManager(P, cfg, start) {
  const { db, FS, esc, L } = P; let list = start.map(x => ({ ...x })), mode = cfg?.mode || 'wall', captions = cfg?.captions !== false, dragId = null;
  const d = P.dialog('plat-gm', '', true);
  const draw = () => {
    d.innerHTML = `<button class="btn close" data-x>✕</button><h2>Gallery Manager</h2><div class="plat-note">Existing images and new ones are managed together. Removing an image only takes it out of the gallery; nothing is lost from the repository.</div>
    <div class="plat-bar"><button class="btn btn-primary" data-up>Upload images</button><label>Display mode <select data-mode><option value="wall"${mode === 'wall' ? ' selected' : ''}>Responsive wall (masonry)</option><option value="carousel"${mode === 'carousel' ? ' selected' : ''}>Carousel / slideshow</option></select></label><label><input type="checkbox" data-caps${captions ? ' checked' : ''}> Show captions</label><span class="plat-status" data-st></span></div>
    <div class="gm-grid">${list.map((x, i) => `<div class="gm-item${x.cover ? ' cover' : ''}" draggable="true" data-id="${esc(x.id)}">${P.img(x.src, x.caption)}
      <input data-k="caption" data-id="${esc(x.id)}" placeholder="Caption" value="${esc(x.caption || '')}"><input data-k="desc" data-id="${esc(x.id)}" placeholder="Description" value="${esc(x.desc || '')}"><input data-k="category" data-id="${esc(x.id)}" placeholder="Category" value="${esc(x.category || '')}"><input data-k="tags" data-id="${esc(x.id)}" placeholder="tags, separated, by commas" value="${esc((x.tags || []).join(', '))}">
      <div class="plat-bar" style="margin:6px 0 0"><button class="btn" data-cover="${esc(x.id)}">${x.cover ? 'Cover ✓' : 'Set cover'}</button><button class="btn" data-rep="${esc(x.id)}">Replace</button><button class="btn" data-mv="-1" data-id="${esc(x.id)}">↑</button><button class="btn" data-mv="1" data-id="${esc(x.id)}">↓</button><button class="btn" data-rm="${esc(x.id)}">Remove</button></div></div>`).join('')}</div>
    ${!list.length ? '<p class="plat-empty">No images.</p>' : ''}<div class="plat-bar" style="margin-top:16px"><button class="btn btn-primary" data-save>Save gallery</button><button class="btn" data-prev>Preview</button></div><div data-pv></div>`;
  };
  draw();
  const keep = () => d.querySelectorAll('[data-k]').forEach(i => { const it = list.find(x => x.id === i.dataset.id); if (it) it[i.dataset.k] = i.dataset.k === 'tags' ? i.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 12) : i.value.slice(0, 300); });
  d.addEventListener('click', P.run(async e => {
    const t = e.target.closest('button'); if (!t) return; keep();
    if (t.dataset.up !== undefined) { d.querySelector('[data-st]').textContent = 'Uploading…'; const refs = await P.pickImages(true); refs.forEach(src => list.push({ id: P.uid8(), src, caption: '', desc: '', category: '', tags: [], cover: false })); draw(); }
    else if (t.dataset.rm) { list = list.filter(x => x.id !== t.dataset.rm); draw(); }
    else if (t.dataset.rep) { const r = await P.pickImages(false); if (r[0]) { list.find(x => x.id === t.dataset.rep).src = r[0]; draw(); } }
    else if (t.dataset.cover) { list.forEach(x => { x.cover = x.id === t.dataset.cover && !x.cover; }); draw(); }
    else if (t.dataset.mv) { const i = list.findIndex(x => x.id === t.dataset.id), j = i + +t.dataset.mv; if (j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; draw(); } }
    else if (t.dataset.prev !== undefined) d.querySelector('[data-pv]').innerHTML = `<hr><div class="${mode === 'wall' ? 'g-masonry' : 'gm-grid'}">${list.map(x => `<div class="mi">${P.img(x.src, x.caption)}${captions ? `<span>${esc(x.caption || '')}</span>` : ''}</div>`).join('')}</div>`;
    else if (t.dataset.save !== undefined) { await FS.setDoc(FS.doc(db, 'cms_gallery', 'main'), { mode, captions, items: list.map(x => ({ id: x.id, src: x.src, caption: x.caption || '', desc: x.desc || '', category: x.category || '', tags: x.tags || [], cover: !!x.cover })), updatedBy: P.uid(), updatedAt: FS.serverTimestamp() }); d.close(); P.toast('Gallery saved.'); }
  }));
  d.addEventListener('change', e => { if (e.target.matches('[data-mode]')) mode = e.target.value; if (e.target.matches('[data-caps]')) captions = e.target.checked; });
  d.addEventListener('dragstart', e => { const c = e.target.closest('.gm-item'); if (c) { dragId = c.dataset.id; keep(); } });
  d.addEventListener('dragover', e => { if (dragId && e.target.closest('.gm-item')) e.preventDefault(); });
  d.addEventListener('drop', e => { const c = e.target.closest('.gm-item'); if (!c || !dragId) return; e.preventDefault(); const ids = L.reorderIds(list, dragId, c.dataset.id); list = ids.map(id => list.find(x => x.id === id)); dragId = null; draw(); });
}

/* =========================================================================================== */
/*  BIRTHDAYS: the existing calendar stays; this adds a strip with current profile photos        */
/* =========================================================================================== */
export function extend(P, page) {
  if (page !== 'birthdays' || !P.isMember()) return;
  const cal = document.getElementById('bd-cal'); if (!cal || document.getElementById('bd-strip')) return;
  cal.insertAdjacentHTML('beforebegin', '<div id="bd-strip" class="plat-card" style="margin:0 0 20px"></div>');
  const strip = document.getElementById('bd-strip'), A = P.A();
  const draw = () => {
    if (!strip.isConnected) return;
    const now = new Date(), y = now.getFullYear(), today = Date.UTC(y, now.getMonth(), now.getDate());
    const next = (A.birthdays?.() || []).filter(b => Number.isInteger(b.month) && Number.isInteger(b.day)).map(b => { let t = Date.UTC(y, b.month - 1, b.day); if (t < today) t = Date.UTC(y + 1, b.month - 1, b.day); return { ...b, t }; }).sort((a, b) => a.t - b.t).slice(0, 8);
    strip.innerHTML = `<h3>Next birthdays</h3>${next.length ? `<div class="plat-grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr))">${next.map(b => `<div class="plat-row" style="border:0">${P.avatar(b.id, b.name, '')}<span class="grow"><b>${P.esc(P.prof(b.id)?.name || b.name)}</b><br><small class="meta">${P.esc(new Date(b.t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }))}${b.t === today ? ' · today' : ''}</small></span></div>`).join('')}</div>` : '<p class="plat-empty">No birthdays saved yet.</p>'}`;
  };
  draw();
  new MutationObserver(draw).observe(cal, { childList: true });          // the existing calendar re-renders when birthdays change
  P.watch(P.subscribe('profiles', draw));                               // a new profile photo shows up here without a reload
}

export function mount(P, page, root) {
  if (!P.isMember()) { root.innerHTML = P.lock(); return; }
  if (page === 'gallery') galleryPage(P, root);
  else if (page === 'hall-of-fame') { root.innerHTML = '<p class="lead">The names the alliance will always remember.</p><div data-m></div>'; cardManager(P, root.querySelector('[data-m]'), 'hof'); }
  else if (page === 'black-book') { root.innerHTML = '<p class="lead">People, alliances and rivals worth remembering. Handle with care.</p><div data-m></div>'; cardManager(P, root.querySelector('[data-m]'), 'bb'); }
}
