/* ANS platform · admin console (lazy loaded, editors only). Roles are the existing ones: editors (cms_editors) and admins (admins). */
const ICONS = ['', 'home', 'book', 'castle', 'shield', 'bell', 'star', 'camera', 'lock', 'user', 'cog'];
const uid8 = () => Math.random().toString(36).slice(2, 10);
const mkb = (type, f) => ({ id: uid8(), type, ...f, sample: true });     // sample: hidden from visitors until an editor edits it

/* page templates (only the block types the editor already supports) */
export const TEMPLATES = {
  blank: ['Blank Page', () => []],
  guide: ['Guide', () => [mkb('subtitle', { text: 'One-line summary of this guide.' }), mkb('heading', { text: 'Overview', level: 2 }), mkb('paragraph', { text: 'Explain the topic here. Replace or delete this sample.' }), mkb('tip', { title: 'Tip:', text: 'A useful tip for readers.' }), mkb('warning', { title: 'Careful:', text: 'Something readers should not miss.' }), mkb('author', { name: '', role: 'Alliance field guide', photo: '' })]],
  gallery: ['Gallery', () => [mkb('paragraph', { text: 'Describe this gallery.' }), mkb('gallery', { layout: 'grid', images: [] })]],
  calendar: ['Calendar', () => [mkb('paragraph', { text: 'Dates for this section live in the ANS Calendars.' }), mkb('button', { label: 'Open ANS Calendars', url: '#calendars', style: 'primary', newTab: false })]],
  board: ['Announcement Board', () => [mkb('paragraph', { text: 'Official news is published in The Raven\'s Bulletin.' }), mkb('button', { label: "Open The Raven's Bulletin", url: '#bulletin', style: 'primary', newTab: false })]],
  cards: ['Card Collection', () => [mkb('heading', { text: 'Collection', level: 2 }), mkb('columns', { cols: [{ blocks: [{ id: uid8(), type: 'container', title: 'Card 1', blocks: [{ id: uid8(), type: 'paragraph', text: 'Card text.' }], sample: true }] }, { blocks: [{ id: uid8(), type: 'container', title: 'Card 2', blocks: [{ id: uid8(), type: 'paragraph', text: 'Card text.' }], sample: true }] }] })]],
  archive: ['Archive', () => [mkb('paragraph', { text: 'Older material kept for reference.' }), mkb('accordion', { title: 'Entry 1', text: 'Details.' }), mkb('accordion', { title: 'Entry 2', text: 'Details.' })]],
  custom: ['Custom Content Page', () => [mkb('heading', { text: 'Title', level: 2 }), mkb('paragraph', { text: 'Build the page with any blocks.' })]],
  section: ['Menu section (no content, only groups other pages)', null]
};

export function openConsole(P, tab = 'menu') {
  const { esc } = P, tabs = [['menu', 'Menu'], ['pages', 'Pages'], ['home', 'Home'], ['mod', 'Moderation'], ['archive', 'Archive'], ['people', 'Members & roles'], ['tools', 'Tools']];
  const d = P.dialog('plat-console', `<h2>Admin console</h2><div class="plat-bar">${tabs.map(([k, t]) => `<button class="btn${k === tab ? ' btn-primary' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
    <div class="plat-bar"><button class="btn" data-go="bulletin">Bulletin manager</button><button class="btn" data-go="calendars">Calendar manager</button><button class="btn" data-go="gallery">Gallery manager</button><button class="btn" data-go="hall-of-fame">Hall of Fame manager</button><button class="btn" data-go="black-book">Black Book manager</button><button class="btn" data-go="contributions">Contribution manager</button><button class="btn" data-go="checklists">Checklists</button></div><div id="ac-body"></div>`, true);
  const body = d.querySelector('#ac-body'), show = t => { d.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('btn-primary', b.dataset.tab === t)); ({ menu: menuManager, pages: pageManager, home: homeManager, mod: moderation, archive: archiveManager, people: people, tools }[t])(P, body); };
  d.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); const g = e.target.closest('[data-go]'); if (g) { d.close(); P.go(g.dataset.go); } });
  show(tab);
}

/* ------------------------------------------------------------------------------------------- */
/*  tree persistence                                                                             */
/* ------------------------------------------------------------------------------------------- */
const saveTree = (P, tree) => P.FS.setDoc(P.FS.doc(P.db, 'cms_nav', 'main'), { items: P.L.sanitizeTree(tree), updatedAt: P.FS.serverTimestamp(), updatedBy: P.uid() });
const allTargets = (P, tree, skip) => { const out = []; P.L.walk(tree, (n, p, depth) => { if (skip && (n.id === skip || P.L.isDescendant(tree, skip, n.id))) return; out.push([n.id, '\u00A0\u00A0'.repeat(depth) + n.label]); }); return out; };

/* ------------------------------------------------------------------------------------------- */
/*  MENU MANAGER                                                                                 */
/* ------------------------------------------------------------------------------------------- */
function menuManager(P, body) {
  const { L, esc, FS, db } = P; let draft = L.clone(P.S.tree), preview = false, dragId = null, dirty = false;
  const idxIn = (id) => { const p = L.parentOf(draft, id), arr = p ? p.children : draft; return arr.findIndex(n => n.id === id); };
  const nodeHtml = (n, depth) => {
    const kids = n.children || [], isCms = n.id.startsWith('cms-'), isSec = n.id.startsWith('sec-');
    return `<div class="mm-node"><div class="mm-row${n.hidden ? ' hid' : ''}" draggable="true" data-id="${esc(n.id)}"><span class="mm-handle" aria-hidden="true">⠿</span>
      <input class="nm" data-k="label" data-id="${esc(n.id)}" value="${esc(n.label)}" aria-label="Menu label" maxlength="80">
      ${depth === 0 ? `<select data-k="icon" data-id="${esc(n.id)}" aria-label="Icon">${ICONS.map(i => `<option value="${i}"${n.icon === i ? ' selected' : ''}>${i || 'no icon'}</option>`).join('')}</select>` : ''}
      <select data-k="access" data-id="${esc(n.id)}" aria-label="Who can open it"><option value="inherit"${n.access === 'inherit' ? ' selected' : ''}>Inherit</option><option value="public"${n.access === 'public' ? ' selected' : ''}>Public</option><option value="members"${n.access === 'members' ? ' selected' : ''}>Members</option></select>
      <button class="btn" data-a="hide" data-id="${esc(n.id)}">${n.hidden ? 'Show' : 'Hide'}</button><button class="btn" data-a="up" data-id="${esc(n.id)}" aria-label="Move up">↑</button><button class="btn" data-a="dn" data-id="${esc(n.id)}" aria-label="Move down">↓</button>
      ${depth > 0 ? `<button class="btn" data-a="promote" data-id="${esc(n.id)}" title="One level up">⇤</button>` : ''}
      <select data-a="moveto" data-id="${esc(n.id)}" aria-label="Move to"><option value="">Move to…</option><option value="__top">Top level</option>${allTargets(P, draft, n.id).map(([i, l]) => `<option value="${esc(i)}">${esc(l)}</option>`).join('')}</select>
      <button class="btn" data-a="out" data-id="${esc(n.id)}" title="Take it out of the menu. The page is kept.">Remove from menu</button>
      ${isCms ? `<button class="btn" data-a="edit" data-id="${esc(n.id)}">Edit page</button>` : ''}${isSec ? '<span class="plat-tag">section</span>' : ''}</div>
      ${kids.length || true ? `<div class="mm-kids">${kids.map((c, i) => `<div class="mm-drop" data-parent="${esc(n.id)}" data-index="${i}"></div>` + nodeHtml(c, depth + 1)).join('')}<div class="mm-drop" data-parent="${esc(n.id)}" data-index="${kids.length}"></div></div>` : ''}</div>`;
  };
  const prevHtml = role => { const t = L.visibleTree(draft, role), ul = list => `<ul>${list.map(n => `<li>${esc(n.label)}${n.children?.length ? ul(n.children) : ''}</li>`).join('')}</ul>`; return ul(t); };
  const draw = () => {
    const known = new Set(L.ids(draft)), cms = (window.ANS_CMS?.list?.() || []).filter(p => !p.replaces && !known.has('cms-' + p.id)), built = P.allPageIds().filter(k => !known.has(k));
    body.innerHTML = `<div class="plat-note">Drag rows (desktop) or use ↑ ↓ ⇤ and “Move to…” (touch). Renaming a label or moving a page never changes its address, so saved items, links and bookmarks keep working. “Remove from menu” does not delete the page.</div>
      <div class="plat-bar"><button class="btn btn-primary" data-a="save">Save menu</button><button class="btn" data-a="newpage">New page / section</button><button class="btn" data-a="prev">${preview ? 'Back to editing' : 'Preview'}</button><button class="btn" data-a="reset">Restore default navigation</button><span class="plat-status">${dirty ? 'Unsaved changes' : (P.S.saved ? 'Saved' : 'Using the default navigation')}</span></div>
      ${preview ? `<div class="plat-grid"><div class="plat-card"><h3>Members see</h3>${prevHtml('member')}</div><div class="plat-card"><h3>Visitors see</h3>${prevHtml('awaiting')}</div></div>`
        : `<div class="mm-drop" data-parent="" data-index="0"></div>${draft.map((n, i) => nodeHtml(n, 0) + `<div class="mm-drop" data-parent="" data-index="${i + 1}"></div>`).join('')}
      <h3>Pages not in the menu</h3>${[...cms.map(p => [`cms-${p.id}`, p.title + (p.status !== 'published' ? ' (draft)' : '')]), ...built.map(k => [k, P.A().HEADS[k][0] + ' (built-in)'])].map(([id, t]) => `<div class="plat-row"><span class="grow">${esc(t)}</span><button class="btn" data-a="add" data-id="${esc(id)}">Add to menu</button></div>`).join('') || '<p class="plat-empty">Every page is in the menu.</p>'}`}`;
  };
  draw();
  const mark = () => { dirty = true; };
  const doMove = (id, parent, index) => { const p = L.parentOf(draft, id), same = (p ? p.id : '') === (parent || ''); const cur = idxIn(id); if (same && cur < index) index--; if (L.move(draft, id, parent || null, index)) { mark(); draw(); } else P.toast('That move is not possible.'); };
  body.addEventListener('change', e => {
    const t = e.target, id = t.dataset.id; if (!id) return;
    if (t.dataset.k) { const n = L.find(draft, id); n[t.dataset.k] = t.dataset.k === 'label' ? t.value.slice(0, 80) : t.value; mark(); }
    else if (t.dataset.a === 'moveto' && t.value) { const target = t.value === '__top' ? '' : t.value; doMove(id, target, null); }
  });
  body.addEventListener('click', P.run(async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id;
    if (a === 'hide') { const n = L.find(draft, id); n.hidden = !n.hidden; mark(); draw(); }
    else if (a === 'up' || a === 'dn') { if (L.shift(draft, id, a === 'up' ? -1 : 1)) { mark(); draw(); } }
    else if (a === 'promote') { if (L.promote(draft, id)) { mark(); draw(); } }
    else if (a === 'out') { if (id === 'home') return P.toast('Home always stays in the menu.'); if (confirm('Take this out of the menu? The page itself is kept and can be added back from “Pages not in the menu”.')) { L.removeFromMenu(draft, id); mark(); draw(); } }
    else if (a === 'add') { L.addNode(draft, { id, label: id.startsWith('cms-') ? (window.ANS_CMS?.info?.(id.slice(4))?.title || id) : (P.A().HEADS[id]?.[0] || id), access: 'inherit' }, null); mark(); draw(); }
    else if (a === 'edit') { window.ANS_CMS?.edit?.(id.slice(4)); }
    else if (a === 'prev') { preview = !preview; draw(); }
    else if (a === 'reset') { if (confirm('Restore the default ANS navigation? Custom pages and sections are not deleted: they move to “Pages not in the menu”.')) { draft = L.DEFAULT_NAV(); mark(); draw(); } }
    else if (a === 'newpage') newPageDialog(P, { tree: draft, onCreate: node => { draft = L.clone(P.S.tree); draw(); } });
    else if (a === 'save') {
      await saveTree(P, draft);
      for (const n of (function flat(t, out = []) { L.walk(t, x => out.push(x)); return out; })(draft)) {          // keep the real page rules in step with the menu setting
        if (!n.id.startsWith('cms-')) continue; const want = L.accessOf(draft, n.id), have = window.ANS_CMS?.visibility?.(n.id.slice(4)) || 'members';
        if (want !== have) await FS.updateDoc(FS.doc(db, 'cms_pages', n.id.slice(4)), { visibility: want, ...P.stampEdit() }).catch(() => {});
      }
      dirty = false; P.toast('Menu saved.'); draw();
    }
  }));
  body.addEventListener('dragstart', e => { const r = e.target.closest('.mm-row'); if (r) { dragId = r.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch { /* ignore */ } } });
  body.addEventListener('dragover', e => { if (!dragId) return; const z = e.target.closest('.mm-drop'), r = e.target.closest('.mm-row'); if (z || r) { e.preventDefault(); body.querySelectorAll('.over,.into-over').forEach(x => x.classList.remove('over', 'into-over')); (z || r).classList.add(z ? 'over' : 'into-over'); } });
  body.addEventListener('dragend', () => { dragId = null; body.querySelectorAll('.over,.into-over').forEach(x => x.classList.remove('over', 'into-over')); });
  body.addEventListener('drop', e => {
    if (!dragId) return; const z = e.target.closest('.mm-drop'), r = e.target.closest('.mm-row'); if (!z && !r) return; e.preventDefault(); const id = dragId; dragId = null;
    if (z) doMove(id, z.dataset.parent, +z.dataset.index); else if (r.dataset.id !== id) doMove(id, r.dataset.id, null);   // dropped on a row = becomes its last child
  });
}

/* ------------------------------------------------------------------------------------------- */
/*  NEW PAGE / SECTION (7.3 + 7.5)                                                               */
/* ------------------------------------------------------------------------------------------- */
export function newPageDialog(P, { tree, onCreate } = {}) {
  const { L, esc, FS, db } = P, t = tree || L.clone(P.S.tree);
  const d = P.dialog('plat-newpage', `<h2>New page or section</h2><label>Page title</label><input id="np-t" maxlength="120"><label>Menu label (optional, defaults to the title)</label><input id="np-l" maxlength="60">
   <label>Description</label><input id="np-d" maxlength="200"><label>Icon (main menu items)</label><select id="np-i">${ICONS.map(i => `<option value="${i}">${i || 'no icon'}</option>`).join('')}</select>
   <label>Content template</label><select id="np-tpl">${Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}">${esc(v[0])}</option>`).join('')}</select>
   <label>Who can open it</label><select id="np-v"><option value="members">ANS members</option><option value="public">Public (visitors too)</option></select>
   <label>Where in the menu</label><select id="np-p"><option value="__top">Main navigation (top level)</option>${allTargets(P, t).map(([i, l]) => `<option value="${esc(i)}">Under: ${esc(l)}</option>`).join('')}<option value="__none">Not in the menu (independent page)</option></select>
   <label>Status</label><select id="np-s"><option value="draft">Draft</option><option value="published">Published</option></select>
   <div class="plat-bar" style="margin-top:14px"><button class="btn btn-primary" id="np-go">Create</button><span class="plat-status" id="np-st"></span></div>`);
  d.querySelector('#np-go').onclick = P.run(async () => {
    const q = s => d.querySelector(s).value, title = q('#np-t').trim(); if (!title) { d.querySelector('#np-st').textContent = 'The title is required.'; return; }
    const label = q('#np-l').trim() || title, tpl = q('#np-tpl'), parent = q('#np-p'), vis = q('#np-v'), tree2 = L.clone(P.S.tree), pid = parent === '__top' || parent === '__none' ? null : parent;
    let nodeId;
    if (tpl === 'section') { nodeId = 'sec-' + uid8(); }
    else {
      const blocks = TEMPLATES[tpl][1](), status = q('#np-s');
      const ref = await FS.addDoc(FS.collection(db, 'cms_pages'), { title, subtitle: q('#np-d').trim(), slug: L.slugify(title), categoryId: null, order: 0, status, replaces: null, blocks: status === 'published' ? blocks : [], visibility: vis, authorId: P.uid(), ...P.stampNew() });
      await FS.setDoc(FS.doc(db, 'cms_drafts', ref.id), { title, subtitle: q('#np-d').trim(), blocks, updatedAt: FS.serverTimestamp() });
      nodeId = 'cms-' + ref.id;
    }
    if (parent !== '__none' || tpl === 'section') { L.addNode(tree2, { id: nodeId, label, icon: q('#np-i'), access: vis, desc: q('#np-d').trim() }, pid); await saveTree(P, tree2); }
    d.close(); P.toast('Created.'); onCreate?.({ id: nodeId });
    if (tpl !== 'section') setTimeout(() => window.ANS_CMS?.edit?.(nodeId.slice(4)), 300);
  });
}

/* ------------------------------------------------------------------------------------------- */
/*  PAGE MANAGER                                                                                 */
/* ------------------------------------------------------------------------------------------- */
function pageManager(P, body) {
  const { L, esc, FS, db } = P; let q = '';
  const draw = () => {
    const pages = (window.ANS_CMS?.list?.() || []).filter(p => !q || L.norm(p.title).includes(L.norm(q)));
    body.innerHTML = `<div class="plat-bar"><button class="btn btn-primary" data-a="new">New page / section</button><input data-q placeholder="Filter pages…" value="${esc(q)}"></div>
      ${pages.length ? pages.sort((a, b) => (a.title || '').localeCompare(b.title || '')).map(p => { const key = 'cms-' + p.id, path = L.pathTo(P.S.tree, key).map(i => P.nodeLabel(i)).join(' › ');
        return `<div class="plat-row"><span class="grow"><b>${esc(p.title)}</b> <span class="plat-tag ${p.status === 'published' ? 'ok' : ''}">${esc(p.status)}</span>${p.archived ? '<span class="plat-tag">archived</span>' : ''}${p.replaces ? `<span class="plat-tag">customizes ${esc(p.replaces)}</span>` : ''}<br><small class="meta">${esc(path || 'Not in the menu')} · ${esc(p.visibility || 'members')} · by ${esc(P.nameOf(p.createdBy || p.authorId, p.createdByName))}</small></span>
        <button class="btn" data-a="open" data-id="${esc(p.id)}">Open</button><button class="btn" data-a="edit" data-id="${esc(p.id)}">Edit</button><button class="btn" data-a="pub" data-id="${esc(p.id)}">${p.status === 'published' ? 'Unpublish' : 'Publish'}</button>
        <button class="btn" data-a="dup" data-id="${esc(p.id)}">Duplicate</button><button class="btn" data-a="arch" data-id="${esc(p.id)}">${p.archived ? 'Restore' : 'Archive'}</button><button class="btn" data-a="del" data-id="${esc(p.id)}">Delete</button></div>`; }).join('') : '<p class="plat-empty">No pages.</p>'}`;
  };
  draw(); const un = P.subscribe('nav', draw);
  body.addEventListener('input', e => { if (e.target.matches('[data-q]')) { q = e.target.value; clearTimeout(e.target._t); e.target._t = setTimeout(() => { draw(); body.querySelector('[data-q]')?.focus(); }, 250); } });
  body.addEventListener('click', P.run(async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id, pg = (window.ANS_CMS.list() || []).find(x => x.id === id);
    if (a === 'new') newPageDialog(P, { onCreate: () => setTimeout(draw, 400) });
    else if (a === 'open') { document.getElementById('plat-console').close(); P.go(pg.replaces || 'cms-' + id); }
    else if (a === 'edit') window.ANS_CMS.edit(id);
    else if (a === 'pub') { pg.status === 'published' ? await window.ANS_CMS.unpublish(id) : await window.ANS_CMS.publish(id); setTimeout(draw, 400); }
    else if (a === 'dup') { const dr = await FS.getDoc(FS.doc(db, 'cms_drafts', id)), src = dr.exists() ? dr.data() : pg, title = (pg.title + ' (copy)').slice(0, 120);
      const ref = await FS.addDoc(FS.collection(db, 'cms_pages'), { title, subtitle: src.subtitle || '', slug: L.slugify(title), categoryId: null, order: 0, status: 'draft', replaces: null, blocks: [], visibility: pg.visibility || 'members', authorId: P.uid(), ...P.stampNew() });
      await FS.setDoc(FS.doc(db, 'cms_drafts', ref.id), { title, subtitle: src.subtitle || '', blocks: src.blocks || [], updatedAt: FS.serverTimestamp() }); P.toast('Duplicated as a draft.'); setTimeout(draw, 400); }
    else if (a === 'arch') await setArchived(P, 'cms_pages', id, !pg.archived, 'cms-' + id);
    else if (a === 'del') { if (confirm('Delete this page for good? Its address stops working. Archive it instead to keep it.')) { await FS.deleteDoc(FS.doc(db, 'cms_pages', id)); await FS.deleteDoc(FS.doc(db, 'cms_drafts', id)).catch(() => {}); const t = L.clone(P.S.tree); if (L.removeFromMenu(t, 'cms-' + id)) await saveTree(P, t); setTimeout(draw, 400); } }
  }));
  return un;
}
/* archive ≠ delete: the record stays, links keep working; pages also leave the menu while archived */
async function setArchived(P, col, id, on, navId) {
  const { FS, db, L } = P; await FS.updateDoc(FS.doc(db, col, id), { archived: on, ...P.stampEdit() });
  if (navId) { const t = L.clone(P.S.tree), n = L.find(t, navId); if (n) { n.hidden = on; await saveTree(P, t); } }
  P.toast(on ? 'Archived. Nothing was deleted.' : 'Restored.');
}

/* ------------------------------------------------------------------------------------------- */
/*  HOME MANAGER (enable/disable, reorder, titles, images, featured items, member-only, preview, publish)    */
/* ------------------------------------------------------------------------------------------- */
async function homeManager(P, body) {
  const { FS, db, esc, L } = P, content = await import('./ans-platform-content.js');
  let cfg; const [pub, dr] = await Promise.all([FS.getDoc(FS.doc(db, 'cms_home', 'main')), FS.getDoc(FS.doc(db, 'cms_drafts', 'home-draft'))]);
  cfg = L.clone(dr.exists() ? dr.data() : pub.exists() ? pub.data() : content.DEFAULT_HOME()); cfg.modules = cfg.modules || [];
  const options = () => { const out = []; L.walk(P.S.tree, (n, p, depth) => { if (!n.id.startsWith('sec-')) out.push([L.refOf(n.id), '\u00A0\u00A0'.repeat(depth) + n.label]); }); (window.ANS_CMS?.list?.() || []).filter(p => !p.replaces && !L.find(P.S.tree, 'cms-' + p.id)).forEach(p => out.push(['cms:' + p.id, p.title])); return out; };
  const draw = () => {
    const opts = options();
    body.innerHTML = `<div class="plat-note">Modules point to existing pages and records; nothing is duplicated. “Members only” modules show visitors a locked teaser (title, description and the image you pick), never the real content.</div>
    <div class="plat-bar"><button class="btn" data-a="draft">Save draft</button><button class="btn" data-a="prev">Preview</button><button class="btn btn-primary" data-a="publish">Publish to Home</button><button class="btn" data-a="reset">Restore default Home</button><span class="plat-status" data-st></span></div>
    ${cfg.modules.map((m, i) => `<div class="plat-card" style="margin-bottom:12px" data-i="${i}"><div class="plat-bar"><label><input type="checkbox" data-k="enabled"${m.enabled !== false ? ' checked' : ''}> Show</label><b>${esc(m.type)}</b><button class="btn" data-a="up" data-i="${i}">↑</button><button class="btn" data-a="dn" data-i="${i}">↓</button></div>
      <label>Title</label><input data-k="title" value="${esc(m.title)}" style="width:100%"><label>Description</label><input data-k="desc" value="${esc(m.desc || '')}" style="width:100%">
      <label>Who sees the real content</label><select data-k="access"><option value="public"${m.access === 'public' ? ' selected' : ''}>Everyone</option><option value="members"${m.access !== 'public' ? ' selected' : ''}>Members only (visitors see “Only for ANS Members”)</option></select>
      <div class="plat-bar" style="margin-top:8px"><button class="btn" data-a="img" data-i="${i}">Preview image</button>${m.image ? `<button class="btn" data-a="noimg" data-i="${i}">Remove image</button><span style="max-width:90px">${P.img(m.image, '')}</span>` : ''}</div>
      ${['quick', 'featured', 'month'].includes(m.type) ? `<h3>${m.type === 'month' ? 'Guide of the Month' : 'Items'}</h3>${(m.items || []).map((it, k) => `<div class="plat-row"><span class="grow">${esc(opts.find(o => o[0] === it.ref)?.[1]?.trim() || it.ref)}</span><button class="btn" data-a="rmitem" data-i="${i}" data-k="${k}">Remove</button></div>`).join('')}
        ${m.type === 'month' && (m.items || []).length ? '' : `<select data-a="additem" data-i="${i}"><option value="">Add a page…</option>${opts.map(([r, l]) => `<option value="${esc(r)}">${esc(l)}</option>`).join('')}</select>`}` : ''}</div>`).join('')}<div id="home-prev"></div>`;
  };
  draw();
  body.addEventListener('change', e => {
    const t = e.target, card = t.closest('[data-i]'); if (!card) return; const m = cfg.modules[+card.dataset.i];
    if (t.dataset.k) m[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
    else if (t.dataset.a === 'additem' && t.value) { m.items = m.type === 'month' ? [{ ref: t.value }] : [...(m.items || []), { ref: t.value }]; draw(); }
  });
  body.addEventListener('click', P.run(async e => {
    const b = e.target.closest('[data-a]'); if (!b || b.tagName === 'SELECT') return; const a = b.dataset.a, i = +b.dataset.i, st = body.querySelector('[data-st]');
    if (a === 'up' && i > 0) { [cfg.modules[i - 1], cfg.modules[i]] = [cfg.modules[i], cfg.modules[i - 1]]; draw(); }
    else if (a === 'dn' && i < cfg.modules.length - 1) { [cfg.modules[i + 1], cfg.modules[i]] = [cfg.modules[i], cfg.modules[i + 1]]; draw(); }
    else if (a === 'img') { const r = await P.pickImages(false); if (r[0]) { cfg.modules[i].image = r[0]; draw(); } }
    else if (a === 'noimg') { cfg.modules[i].image = ''; draw(); }
    else if (a === 'rmitem') { cfg.modules[i].items.splice(+b.dataset.k, 1); draw(); }
    else if (a === 'draft') { await FS.setDoc(FS.doc(db, 'cms_drafts', 'home-draft'), { ...cfg, updatedAt: FS.serverTimestamp() }); st.textContent = 'Draft saved (visitors and members still see the published Home).'; }
    else if (a === 'prev') { const box = body.querySelector('#home-prev'); box.innerHTML = '<h3>Preview (as a member)</h3><div class="plat-card"></div>'; await content.renderDash(P, box.querySelector('.plat-card'), cfg); }
    else if (a === 'publish') { await FS.setDoc(FS.doc(db, 'cms_home', 'main'), { ...cfg, updatedAt: FS.serverTimestamp(), updatedBy: P.uid() }); st.textContent = 'Published. Home is updated for everyone.'; }
    else if (a === 'reset') { if (confirm('Restore the default Home layout? (Not published until you press Publish.)')) { cfg = content.DEFAULT_HOME(); draw(); } }
  }));
}

/* ------------------------------------------------------------------------------------------- */
/*  COMMENT MODERATION                                                                           */
/* ------------------------------------------------------------------------------------------- */
async function moderation(P, body) {
  const { FS, db, esc } = P; body.innerHTML = '<p class="plat-empty">Loading reports…</p>';
  const draw = async () => {
    const s = await FS.getDocs(FS.query(FS.collection(db, 'comment_reports'), FS.where('status', '==', 'open'), FS.limit(100))), reps = s.docs.map(d => ({ id: d.id, ...d.data() }));
    const cmts = await Promise.all(reps.map(r => FS.getDoc(FS.doc(db, 'comments', r.commentId)).then(x => x.exists() ? { id: x.id, ...x.data() } : null).catch(() => null)));
    body.innerHTML = reps.length ? reps.map((r, i) => { const c = cmts[i]; return `<div class="plat-card" style="margin-bottom:10px"><div class="meta">Reported by ${esc(P.nameOf(r.reporterUid))} · ${esc(P.fmtDate(P.L.toMs(r.createdAt)))} · on ${esc(r.target)}</div><p><b>Reason:</b> ${esc(r.reason)}</p>${c ? `<p class="plat-note">${esc(P.nameOf(c.uid, c.name))}: ${esc(c.text)} ${c.hidden ? '<span class="plat-tag warn">hidden</span>' : ''}</p>` : '<p class="plat-note">The comment no longer exists.</p>'}
      <div class="plat-bar">${c ? `<button class="btn" data-a="${c.hidden ? 'show' : 'hide'}" data-c="${esc(c.id)}" data-r="${esc(r.id)}">${c.hidden ? 'Restore comment' : 'Hide comment'}</button><button class="btn" data-a="delc" data-c="${esc(c.id)}" data-r="${esc(r.id)}">Delete comment</button>` : ''}<button class="btn" data-a="close" data-r="${esc(r.id)}">Dismiss report</button></div></div>`; }).join('') : '<p class="plat-empty">No open reports. Moderators can also hide or delete any comment directly where it is posted.</p>';
  };
  await draw();
  body.addEventListener('click', P.run(async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, c = b.dataset.c && FS.doc(db, 'comments', b.dataset.c), r = FS.doc(db, 'comment_reports', b.dataset.r);
    if (a === 'hide' || a === 'show') await FS.updateDoc(c, { hidden: a === 'hide', moderatedBy: P.uid(), moderatedAt: FS.serverTimestamp() });
    if (a === 'delc') { if (!confirm('Delete this comment?')) return; await FS.deleteDoc(c); await FS.updateDoc(r, { status: 'closed', closedBy: P.uid() }); }
    if (a === 'close') await FS.updateDoc(r, { status: 'closed', closedBy: P.uid() });
    await draw();
  }));
}

/* ------------------------------------------------------------------------------------------- */
/*  ARCHIVE MANAGER                                                                              */
/* ------------------------------------------------------------------------------------------- */
async function archiveManager(P, body) {
  const { FS, db, esc, L } = P; body.innerHTML = '<p class="plat-empty">Loading…</p>';
  const SRC = [['bulletin_posts', 'Announcement', r => r.title, r => 'bulletin-' + r.id], ['cms_pages', 'Page', r => r.title, r => r.replaces || 'cms-' + r.id], ['cal_events', 'Event', r => r.title, () => 'calendars'], ['cal_calendars', 'Calendar', r => r.name, () => 'calendars'], ['checklist_templates', 'Checklist', r => r.title, () => 'checklists']];
  const draw = async () => {
    const rows = [];
    for (const [col, label, title, link] of SRC) { try { (await FS.getDocs(FS.query(FS.collection(db, col), FS.where('archived', '==', true), FS.limit(200)))).docs.forEach(d => rows.push({ col, label, id: d.id, title: title({ id: d.id, ...d.data() }), link: link({ id: d.id, ...d.data() }) })); } catch (e) { console.warn('[archive]', col, e); } }
    body.innerHTML = `<div class="plat-note">Archived items are kept, keep their addresses and can be restored at any time. To archive something, use its Archive button (announcements, events, calendars, checklists, Pages tab).</div>${rows.length ? rows.map(r => `<div class="plat-row"><span class="plat-tag">${esc(r.label)}</span><span class="grow">${esc(r.title)}</span><button class="btn" data-a="open" data-l="${esc(r.link)}">Open</button><button class="btn" data-a="restore" data-col="${esc(r.col)}" data-id="${esc(r.id)}">Restore</button></div>`).join('') : '<p class="plat-empty">Nothing is archived.</p>'}`;
  };
  await draw();
  body.addEventListener('click', P.run(async e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'open') { document.getElementById('plat-console').close(); P.go(b.dataset.l); } else { await setArchived(P, b.dataset.col, b.dataset.id, false, b.dataset.col === 'cms_pages' ? 'cms-' + b.dataset.id : null); await draw(); } }));
}

/* ------------------------------------------------------------------------------------------- */
/*  MEMBER PERMISSIONS (uses the existing manager: approvals, editors, roles)                      */
/* ------------------------------------------------------------------------------------------- */
function people(P, body) {
  body.innerHTML = `<div class="plat-note">Roles are the ones the site already had: <b>approved member</b> (opens Guides, The Alliance, The Raven's Nest, Community), <b>editor</b> (can create and edit content, run the managers and moderate comments) and <b>admin</b> (also approves members and grants the editor role). Moderators are editors.</div>
   <div class="plat-bar"><button class="btn btn-primary" data-a="req">Review membership requests</button><button class="btn" data-a="cms">Open the CMS manager (editors &amp; page tree)</button></div>`;
  body.addEventListener('click', e => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; document.getElementById('plat-console').close(); if (a === 'req') P.A().navigate('requests'); else document.querySelector('[data-cms-manage]')?.click(); });
}

/* ------------------------------------------------------------------------------------------- */
/*  TOOLS: protect the built-in guides in Firestore (so visitors cannot read them from the page source)       */
/* ------------------------------------------------------------------------------------------- */
async function tools(P, body) {
  const { FS, db, esc } = P, A = P.A(), guides = window.ANS_DATA?.guides || {}, keys = Object.keys(guides).filter(k => k !== 'guide-origin-curse');
  const pages = () => window.ANS_CMS?.list?.() || [];
  const draw = () => {
    const rows = keys.map(k => { const p = pages().find(x => x.replaces === k); return [k, p ? (p.status === 'published' ? 'protected' : 'draft') : 'in page source']; });
    body.innerHTML = `<div class="plat-note"><b>Protect the guides.</b> The built-in guides are written inside index.html, so anyone can read them with “view source”, even without an account. This copies each one into Firestore (members only) as a published page that <b>replaces</b> the original on screen. Nothing is removed and your customized versions are never overwritten.
      After every guide shows “protected”, run <code>node tools/strip-protected.mjs</code> and deploy the stripped index.html (see DEPLOY.md). Origin of the Curse, the interactive pages (Constitution, Gear, Alliance Duel, Sanctuary) and the images stay in the site files: see Remaining limitations in DEPLOY.md.</div>
      ${keys.length ? rows.map(([k, s]) => `<div class="plat-row"><span class="grow">${esc(A.HEADS[k]?.[0] || k)} <small class="meta">${esc(k)}</small></span><span class="plat-tag ${s === 'protected' ? 'ok' : s === 'draft' ? 'warn' : ''}">${s}</span></div>`).join('') : '<p class="plat-empty">The built-in guides are no longer in the page (already stripped), or the page data did not load.</p>'}
      <div class="plat-bar" style="margin-top:12px"><button class="btn btn-primary" data-a="mig"${keys.length ? '' : ' disabled'}>Protect built-in guides now</button><span class="plat-status" data-st></span></div>`;
  };
  draw();
  body.addEventListener('click', P.run(async e => {
    if (!e.target.closest('[data-a=mig]')) return; const st = body.querySelector('[data-st]'); let n = 0, skipped = 0;
    for (const k of keys) {
      const have = pages().find(x => x.replaces === k); if (have) { if (have.status !== 'published') skipped++; continue; }
      const html = `<div class="guide-profile">${A.icon('user')}<div><h3>ANS · Ann</h3><small>Alliance field guide</small></div></div>${guides[k] || ''}<div class="shots" data-shots="${esc(k)}"></div>`, [title, subtitle] = A.HEADS[k] || [k, ''], id = 'builtin-' + k, blocks = [{ id: 'orig0001', type: 'html', code: html }];
      await FS.setDoc(FS.doc(db, 'cms_pages', id), { title, subtitle, slug: k, categoryId: null, order: 0, status: 'published', replaces: k, blocks, authorId: P.uid(), createdBy: P.uid(), createdByName: P.myName(), lastModifiedBy: P.uid(), publishedAt: FS.serverTimestamp(), createdAt: FS.serverTimestamp(), updatedAt: FS.serverTimestamp() });
      await FS.setDoc(FS.doc(db, 'cms_drafts', id), { title, subtitle, blocks, updatedAt: FS.serverTimestamp() }); n++;
    }
    st.textContent = `Done: ${n} guide(s) protected${skipped ? `, ${skipped} skipped because a customized draft already exists (publish or delete that draft first)` : ''}.`; setTimeout(draw, 700);
  }));
}
export { menuManager, pageManager, archiveManager };   // exported for the smoke tests
