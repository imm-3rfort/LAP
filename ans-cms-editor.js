/* ANS CMS · visual block editor. Loaded only when an editor opens a page (public visitors never download it).
   Data: cms_drafts/{pageId} = { title, subtitle, blocks[] }.  "Publish" copies it to cms_pages/{pageId} (done by the core).
   Firestore does not allow arrays inside arrays, so columns are [{blocks:[]}] and tables are plain text lines "a | b | c". */
import { doc, getDoc, setDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { esc, pageHtml, imgAttr } from './ans-cms-render.js';

const TYPES = [['heading', 'Heading'], ['subtitle', 'Subtitle'], ['paragraph', 'Paragraph'], ['author', 'Author'], ['tip', 'Tip / info box'], ['warning', 'Warning'], ['image', 'Image'], ['gallery', 'Gallery / carousel'], ['list', 'List'], ['table', 'Table'], ['quote', 'Quote'], ['divider', 'Divider'], ['button', 'Button / link'], ['accordion', 'Expandable section'], ['container', 'Content container'], ['columns', 'Columns'], ['html', 'Raw HTML']];
const LABEL = Object.fromEntries(TYPES);
const uid8 = () => Math.random().toString(36).slice(2, 10);
const NEW = {
  heading: () => ({ text: 'New heading', level: 2 }), subtitle: () => ({ text: '' }), paragraph: () => ({ text: '' }),
  author: () => ({ name: '', role: 'Alliance field guide', photo: '' }), tip: () => ({ title: 'Tip:', text: '' }), warning: () => ({ title: 'Warning:', text: '' }),
  image: () => ({ src: '', alt: '', caption: '' }), gallery: () => ({ layout: 'grid', images: [] }), list: () => ({ style: 'ul', items: [] }),
  table: () => ({ header: true, text: 'Column A | Column B\nValue 1 | Value 2' }), quote: () => ({ text: '', cite: '' }), divider: () => ({}),
  button: () => ({ label: 'Open', url: '', style: 'primary', newTab: true }), accordion: () => ({ title: 'Title', text: '' }),
  container: () => ({ title: '', blocks: [] }), columns: () => ({ cols: [{ blocks: [] }, { blocks: [] }] }), html: () => ({ code: '' })
};
const mk = type => ({ id: uid8(), type, ...NEW[type]() });
const clone = b => { const c = JSON.parse(JSON.stringify(b)); (function fix(x) { x.id = uid8(); (x.blocks || []).forEach(fix); (x.cols || []).forEach(k => (k.blocks || []).forEach(fix)); })(c); return c; };

let S = null;   // editor state: { id, api, title, subtitle, blocks, dirty, mode, status }

/* ---------- list addressing: '' = page root, '3/blocks' = inside block 3, '4/cols/1' = column 1 of block 4 ---------- */
function listAt(loc) {
  let cur = S.blocks;
  if (!loc) return cur;
  const t = loc.split('/');
  for (let i = 0; i < t.length;) {
    const blk = cur[+t[i]];
    if (t[i + 1] === 'blocks') { blk.blocks = blk.blocks || []; cur = blk.blocks; i += 2; } else { cur = blk.cols[+t[i + 2]].blocks; i += 3; }
  }
  return cur;
}
const touch = () => { S.dirty = true; setState(); };
function move(loc, i, dir) { const l = listAt(loc), j = i + dir; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; touch(); draw(); }
function remove(loc, i) { if (!confirm('Delete this block?')) return; listAt(loc).splice(i, 1); touch(); draw(); }
function dupe(loc, i) { const l = listAt(loc); l.splice(i + 1, 0, clone(l[i])); touch(); draw(); }
function insert(loc, i, block) { listAt(loc).splice(i, 0, block); touch(); draw(); }
function dropMove(fromLoc, fromIdx, toLoc, toIdx) {
  const inside = toLoc === `${fromLoc}${fromLoc ? '/' : ''}${fromIdx}` || toLoc.startsWith(`${fromLoc}${fromLoc ? '/' : ''}${fromIdx}/`);
  if (inside) return;                                              // a container cannot be dropped inside itself
  const [b] = listAt(fromLoc).splice(fromIdx, 1);
  if (fromLoc === toLoc && toIdx > fromIdx) toIdx--;
  listAt(toLoc).splice(toIdx, 0, b); touch(); draw();
}

/* ---------- image upload: stored in Firestore (cms_images/{id}), like the profile photo. No GitHub, no token. ----------
   The picture is resized in the browser (max 1600 px, JPEG) until it is small enough for one Firestore document (< 1 MB). */
const MAX_CHARS = 820000;                                      // data-URL length that always fits a Firestore document
async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file is not a readable image.')); i.src = url; });
    const big = Math.max(img.naturalWidth, img.naturalHeight);
    for (const side of [1600, 1400, 1200, 1000, 800, 600]) {
      const k = Math.min(1, side / big);
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.86, 0.76, 0.66, 0.55]) { const d = c.toDataURL('image/jpeg', q); if (d.length <= MAX_CHARS) return { data: d, w: c.width, h: c.height }; }
    }
    throw new Error('That image is too large even after shrinking it. Try a smaller one.');
  } finally { URL.revokeObjectURL(url); }
}
async function uploadImage(file) {
  if (!/^image\//.test(file.type)) throw new Error('Choose an image file.');
  const { data, w, h } = await compress(file);
  const ref = doc(collection(S.api.db, 'cms_images'));           // random, hard-to-guess id
  await setDoc(ref, { data, w, h, by: S.api.uid || '', name: String(file.name || '').slice(0, 80), createdAt: serverTimestamp() });
  return 'cms-img:' + ref.id;                                    // this is what the block stores; the site loads it on demand
}
async function pickAndUpload(multiple) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multiple;
  const files = await new Promise(ok => { inp.onchange = () => ok([...inp.files]); inp.click(); });
  const out = [];
  for (const f of files) {
    status(`Uploading ${f.name}…`);
    try { out.push(await uploadImage(f)); } catch (e) { console.error('[ANS CMS image]', e); alert(e && e.message && !/permission/i.test(e.message) ? e.message : 'The image could not be saved. Check that you can edit the site and that the new Firestore rules are published.'); break; }
  }
  status(out.length ? 'Uploaded. Remember to Save draft / Publish.' : '');
  return out;
}

/* ---------- field forms per block type ---------- */
const inp = (loc, i, f, v, label, ph = '') => `<label class="ed-f"><span>${label}</span><input data-f="${f}" data-loc="${loc}" data-i="${i}" value="${esc(v ?? '')}" placeholder="${esc(ph)}"></label>`;
const area = (loc, i, f, v, label, rows = 4, ph = '') => `<label class="ed-f"><span>${label}</span><textarea rows="${rows}" data-f="${f}" data-loc="${loc}" data-i="${i}" placeholder="${esc(ph)}">${esc(v ?? '')}</textarea></label>`;
const sel = (loc, i, f, v, label, opts) => `<label class="ed-f"><span>${label}</span><select data-f="${f}" data-loc="${loc}" data-i="${i}">${opts.map(([k, t]) => `<option value="${k}"${String(v) === String(k) ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
const upBtn = (loc, i, f, multi) => `<button class="btn" type="button" data-up="${f}" data-loc="${loc}" data-i="${i}"${multi ? ' data-multi="1"' : ''}>⬆ Upload${multi ? ' images' : ' image'}</button>`;

function fields(loc, i, b) {
  switch (b.type) {
    case 'heading': return inp(loc, i, 'text', b.text, 'Text') + sel(loc, i, 'level', b.level, 'Size', [[2, 'Heading'], [3, 'Subheading']]);
    case 'subtitle': return area(loc, i, 'text', b.text, 'Text', 2);
    case 'paragraph': return area(loc, i, 'text', b.text, 'Text (**bold**, *italic*, [link](https://…); blank line = new paragraph)', 6);
    case 'author': return inp(loc, i, 'name', b.name, 'Name') + inp(loc, i, 'role', b.role, 'Role / subtitle') + inp(loc, i, 'photo', b.photo, 'Photo (optional)', 'cms-img:… (use the button)') + upBtn(loc, i, 'photo');
    case 'tip': case 'warning': return inp(loc, i, 'title', b.title, 'Label') + area(loc, i, 'text', b.text, 'Text', 3);
    case 'image': return inp(loc, i, 'src', b.src, 'Image address', 'Use the button, or paste https://…') + upBtn(loc, i, 'src') + inp(loc, i, 'alt', b.alt, 'Alt text') + inp(loc, i, 'caption', b.caption, 'Caption');
    case 'gallery': return sel(loc, i, 'layout', b.layout, 'Presentation', [['grid', 'Grid (wall)'], ['carousel', 'Carousel']]) +
      `<div class="ed-gal">${(b.images || []).map((g, k) => `<div class="ed-gi"><img ${imgAttr(g.src)} alt=""><input data-gal="caption" data-loc="${loc}" data-i="${i}" data-k="${k}" value="${esc(g.caption || '')}" placeholder="Description">
        <button class="btn" type="button" data-gm="-1" data-loc="${loc}" data-i="${i}" data-k="${k}">↑</button><button class="btn" type="button" data-gm="1" data-loc="${loc}" data-i="${i}" data-k="${k}">↓</button><button class="btn" type="button" data-gm="x" data-loc="${loc}" data-i="${i}" data-k="${k}">✕</button></div>`).join('')}</div>` +
      upBtn(loc, i, 'gallery', true) + `<button class="btn" type="button" data-galurl data-loc="${loc}" data-i="${i}">+ Add by address</button>`;
    case 'list': return sel(loc, i, 'style', b.style, 'Type', [['ul', 'Bullets'], ['ol', 'Numbered']]) + area(loc, i, 'itemsText', (b.items || []).join('\n'), 'One item per line', 5);
    case 'table': return sel(loc, i, 'header', b.header !== false, 'First row is a header', [[true, 'Yes'], [false, 'No']]) + area(loc, i, 'text', b.text, 'One row per line, cells separated by  |', 6);
    case 'quote': return area(loc, i, 'text', b.text, 'Quote', 3) + inp(loc, i, 'cite', b.cite, 'Who said it');
    case 'button': return inp(loc, i, 'label', b.label, 'Text') + inp(loc, i, 'url', b.url, 'Link', 'https://…') + sel(loc, i, 'style', b.style, 'Style', [['primary', 'Highlighted'], ['normal', 'Normal']]) + sel(loc, i, 'newTab', b.newTab !== false, 'Opens in', [[true, 'New tab'], [false, 'Same tab']]);
    case 'accordion': return inp(loc, i, 'title', b.title, 'Title (always visible)') + area(loc, i, 'text', b.text, 'Text shown when opened', 3) + `<div class="ed-sub"><small>Extra blocks inside:</small>${listHtml(`${loc}${loc ? '/' : ''}${i}/blocks`, b.blocks || [])}</div>`;
    case 'container': return inp(loc, i, 'title', b.title, 'Section title (optional)') + `<div class="ed-sub">${listHtml(`${loc}${loc ? '/' : ''}${i}/blocks`, b.blocks || [])}</div>`;
    case 'columns': return sel(loc, i, 'colCount', b.cols.length, 'Columns', [[2, '2 columns'], [3, '3 columns']]) +
      `<div class="ed-colgrid">${b.cols.map((c, k) => `<div class="ed-sub"><small>Column ${k + 1}</small>${listHtml(`${loc}${loc ? '/' : ''}${i}/cols/${k}`, c.blocks || [])}</div>`).join('')}</div>`;
    case 'html': return area(loc, i, 'code', b.code, 'HTML (advanced)', 8);
    default: return '';
  }
}
const dropzone = (loc, i) => `<div class="ed-drop" data-dz data-loc="${loc}" data-i="${i}"></div>`;
function card(loc, i, b) {
  return `<div class="ed-card" data-type="${b.type}">
    <div class="ed-head"><span class="ed-handle" draggable="true" data-drag data-loc="${loc}" data-i="${i}" title="Drag to move">⠿</span><b>${LABEL[b.type]}</b><span class="ed-actions">
      <button class="btn" type="button" data-mv="-1" data-loc="${loc}" data-i="${i}" aria-label="Move up">↑</button><button class="btn" type="button" data-mv="1" data-loc="${loc}" data-i="${i}" aria-label="Move down">↓</button>
      <button class="btn" type="button" data-dup data-loc="${loc}" data-i="${i}">Duplicate</button><button class="btn" type="button" data-del data-loc="${loc}" data-i="${i}">Delete</button></span></div>
    <div class="ed-body">${fields(loc, i, b) || '<small>This block has no settings.</small>'}</div></div>`;
}
function listHtml(loc, blocks) {
  return `<div class="ed-list">${dropzone(loc, 0)}${blocks.map((b, i) => card(loc, i, b) + dropzone(loc, i + 1)).join('')}
    <select class="ed-add" data-add="${loc}"><option value="">+ Add block…</option>${TYPES.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>`;
}

/* ---------- dialog ---------- */
const CSS = `#cms-editor{width:min(1100px,100%);height:100dvh;max-height:100dvh;margin:auto;padding:0;overflow:hidden;display:flex;flex-direction:column}
#cms-editor[open]{display:flex}
.ed-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--surface)}
.ed-top .btn{min-height:0;padding:8px 12px}.ed-top input{flex:1 1 200px;min-width:0}
.ed-main{flex:1;overflow:auto;padding:16px}
#cms-editor input,#cms-editor textarea,#cms-editor select{width:100%;background:var(--background);color:var(--foreground);border:1px solid var(--border);padding:8px;font-size:15px}
.ed-f{display:block;margin:8px 0}.ed-f span{display:block;font-size:12px;color:var(--muted-foreground);margin-bottom:4px}
.ed-card{border:1px solid var(--border);background:var(--surface);margin:0}.ed-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border)}
.ed-actions{margin-left:auto;display:flex;gap:4px;flex-wrap:wrap}.ed-card .btn,.ed-gal .btn{min-height:0;padding:4px 8px;font-size:11px;margin-top:0}
.ed-handle{cursor:grab;font-size:20px;padding:0 6px;user-select:none;touch-action:none}.ed-body{padding:4px 12px 12px}
.ed-drop{height:12px;margin:2px 0;transition:.15s}.ed-drop.over{height:38px;border:1px dashed var(--primary);background:var(--surface-hover)}
.ed-sub{border-left:2px solid var(--border);padding:6px 0 6px 10px;margin:8px 0}.ed-colgrid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.ed-add{margin-top:6px}.ed-gal{margin:8px 0}.ed-gi{display:flex;align-items:center;gap:6px;margin:4px 0}.ed-gi img{width:44px;height:44px;object-fit:cover;flex:0 0 auto}.ed-gi input{flex:1}
.ed-palette{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.ed-palette .btn{min-height:0;padding:6px 10px;font-size:11px}
.ed-status{font-size:12px;color:var(--muted-foreground)}.ed-preview{margin:-16px}`;

function dlg() {
  let d = document.getElementById('cms-editor'); if (d) return d;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  d = document.createElement('dialog'); d.id = 'cms-editor'; d.className = 'modal';
  d.addEventListener('cancel', e => { if (!leave()) e.preventDefault(); });
  d.addEventListener('click', onClick); d.addEventListener('input', onInput); d.addEventListener('change', onChange);
  d.addEventListener('dragstart', onDragStart); d.addEventListener('dragover', onDragOver); d.addEventListener('dragleave', e => e.target.closest?.('.ed-drop')?.classList.remove('over')); d.addEventListener('drop', onDrop);
  document.body.appendChild(d); return d;
}
const status = t => { const el = document.getElementById('ed-status'); if (el) el.textContent = t; };
function setState() { const el = document.getElementById('ed-state'); if (el) el.textContent = (S.status === 'published' ? 'Published' : 'Draft') + (S.dirty ? ' · unsaved changes' : ''); }
function leave() { return !S.dirty || confirm('You have unsaved changes. Close without saving?'); }

function frame() {
  dlg().innerHTML = `<div class="ed-top"><button class="btn" data-x="close">← Close</button><input id="ed-title" data-meta="title" value="${esc(S.title)}" placeholder="Page title" aria-label="Page title">
    <button class="btn" data-x="mode">${S.mode === 'edit' ? '👁 Preview' : '✎ Back to editing'}</button><button class="btn" data-x="save">Save draft</button><button class="btn btn-primary" data-x="publish">Publish</button>${S.status === 'published' ? '<button class="btn" data-x="unpublish">Unpublish</button>' : ''}
    <span class="ed-status" id="ed-state"></span><span class="ed-status" id="ed-status"></span></div><div class="ed-main" id="ed-main"></div>`;
  draw(); setState();
}
function draw() {
  const m = document.getElementById('ed-main'); if (!m) return;
  const keep = m.scrollTop;
  if (S.mode === 'preview') m.innerHTML = `<div class="ed-preview">${pageHtml({ title: S.title, subtitle: S.subtitle }, S.blocks)}</div>`;
  else m.innerHTML = `<label class="ed-f"><span>Subtitle (shown under the title)</span><input data-meta="subtitle" value="${esc(S.subtitle)}"></label>
    <div class="ed-palette">${TYPES.map(([k, t]) => `<button class="btn" type="button" draggable="true" data-new="${k}">${t}</button>`).join('')}</div>
    <p class="ed-status">Drag a block (⠿ handle or a button above) between the lines, or use the ↑ ↓ buttons and the “+ Add block” menus. On a phone use the buttons.</p>${listHtml('', S.blocks)}`;
  m.scrollTop = keep;
}

/* ---------- events ---------- */
function onInput(e) {
  const t = e.target;
  if (t.dataset.meta) { S[t.dataset.meta] = t.value; touch(); return; }
  if (t.dataset.gal) { const b = listAt(t.dataset.loc)[+t.dataset.i]; b.images[+t.dataset.k].caption = t.value; touch(); return; }
  if (!t.dataset.f) return;
  const b = listAt(t.dataset.loc)[+t.dataset.i], f = t.dataset.f;
  if (f === 'itemsText') b.items = t.value.split('\n');
  else if (f !== 'level' && f !== 'header' && f !== 'newTab' && f !== 'colCount') b[f] = t.value;
  touch();
}
function onChange(e) {
  const t = e.target;
  if (t.dataset.add !== undefined && t.value) { const l = listAt(t.dataset.add); insert(t.dataset.add, l.length, mk(t.value)); return; }
  if (!t.dataset.f) return;
  const b = listAt(t.dataset.loc)[+t.dataset.i], f = t.dataset.f;
  if (f === 'level') b.level = +t.value;
  else if (f === 'header' || f === 'newTab') b[f] = t.value === 'true';
  else if (f === 'colCount') {
    const n = +t.value;
    while (b.cols.length < n) b.cols.push({ blocks: [] });
    while (b.cols.length > n) b.cols[n - 1].blocks.push(...b.cols.pop().blocks);   // nothing is lost when you reduce columns
    touch(); draw(); return;
  } else if (f === 'layout' || f === 'style') b[f] = t.value;
  touch();
}
async function onClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  const loc = t.dataset.loc, i = +t.dataset.i;
  if (t.dataset.x) return action(t.dataset.x);
  if (t.dataset.mv) return move(loc, i, +t.dataset.mv);
  if ('del' in t.dataset) return remove(loc, i);
  if ('dup' in t.dataset) return dupe(loc, i);
  if (t.dataset.new) return insert('', S.blocks.length, mk(t.dataset.new));
  if (t.dataset.up) {
    const b = listAt(loc)[i], paths = await pickAndUpload(!!t.dataset.multi);
    if (!paths.length) return;
    if (t.dataset.up === 'gallery') b.images = [...(b.images || []), ...paths.map(src => ({ src, caption: '' }))];
    else b[t.dataset.up] = paths[0];
    touch(); draw(); return;
  }
  if ('galurl' in t.dataset) { const u = prompt('Image address:'); if (u) { listAt(loc)[i].images.push({ src: u.trim(), caption: '' }); touch(); draw(); } return; }
  if (t.dataset.gm) {
    const imgs = listAt(loc)[i].images, k = +t.dataset.k;
    if (t.dataset.gm === 'x') imgs.splice(k, 1); else { const j = k + +t.dataset.gm; if (j < 0 || j >= imgs.length) return; [imgs[k], imgs[j]] = [imgs[j], imgs[k]]; }
    touch(); draw();
  }
}
/* drag and drop (desktop). On touch screens the ↑ ↓ buttons do the same job. */
let drag = null;
function onDragStart(e) {
  const h = e.target.closest('[data-drag]'), n = e.target.closest('[data-new]');
  if (h) drag = { from: h.dataset.loc, idx: +h.dataset.i }; else if (n) drag = { type: n.dataset.new }; else return;
  e.dataTransfer.setData('text/plain', 'ans-cms'); e.dataTransfer.effectAllowed = 'move';
  if (h) e.dataTransfer.setDragImage(h.closest('.ed-card'), 20, 20);
}
function onDragOver(e) {
  const z = e.target.closest('.ed-drop'); if (!z || !drag) return;
  e.preventDefault(); document.querySelectorAll('.ed-drop.over').forEach(x => x !== z && x.classList.remove('over')); z.classList.add('over');
}
function onDrop(e) {
  const z = e.target.closest('.ed-drop'); if (!z || !drag) return;
  e.preventDefault(); const d = drag; drag = null;
  if (d.type) insert(z.dataset.loc, +z.dataset.i, mk(d.type)); else dropMove(d.from, d.idx, z.dataset.loc, +z.dataset.i);
}

/* ---------- save / publish ---------- */
async function save() {
  const clean = JSON.parse(JSON.stringify(S.blocks));              // drops undefined values Firestore would reject
  await setDoc(doc(S.api.db, 'cms_drafts', S.id), { title: S.title.trim() || 'Untitled', subtitle: S.subtitle || '', blocks: clean, updatedAt: serverTimestamp() });
  S.dirty = false; setState();
}
async function action(x) {
  try {
    if (x === 'close') { if (leave()) dlg().close(); }
    else if (x === 'mode') { S.mode = S.mode === 'edit' ? 'preview' : 'edit'; frame(); }
    else if (x === 'save') { status('Saving…'); await save(); status('Draft saved.'); }
    else if (x === 'publish') { status('Publishing…'); await save(); await S.api.publishPage(S.id); S.status = 'published'; frame(); status('Published. Members see it now.'); }
    else if (x === 'unpublish') { await S.api.unpublishPage(S.id); S.status = 'draft'; frame(); status('Unpublished. Only editors see it.'); }
  } catch (err) { console.error('[ANS CMS editor]', err); status('That could not be saved. You may not have permission.'); }
}

export async function openEditor(id, api) {
  const [d, p] = await Promise.all([getDoc(doc(api.db, 'cms_drafts', id)), getDoc(doc(api.db, 'cms_pages', id))]);
  if (!p.exists()) { alert('That page no longer exists.'); return; }
  const src = d.exists() ? d.data() : { title: p.data().title, subtitle: p.data().subtitle || '', blocks: p.data().blocks || [] };
  S = { id, api, title: src.title || '', subtitle: src.subtitle || '', blocks: src.blocks || [], dirty: false, mode: 'edit', status: p.data().status };
  const el = dlg(); frame(); if (!el.open) el.showModal();
}
