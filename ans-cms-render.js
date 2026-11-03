/* ANS CMS · block renderer. Pure functions (no Firebase). Every block uses the CSS classes your site already has:
   headings -> .content h2/h3 · paragraph/lead -> p/.lead · tip/warning -> .elixir-callout(.warn) · author -> .guide-profile
   image -> .shots/.film · gallery -> .g-wall/.g-item and .g-car · table -> .gear-table-wrap .pt · expandable -> details/summary */

export const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

/* links and images only accept safe addresses (no javascript:) */
export const safeUrl = u => {
  u = String(u || '').trim();
  return /^\s*(javascript|vbscript|data):/i.test(u) ? '' : u;
};
export const imgSrc = u => {
  u = String(u || '').trim();
  if (/^cms-img:[A-Za-z0-9]{6,40}$/.test(u)) return u;        // image stored in Firestore (cms_images/{id}), no GitHub needed
  return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u) ? u : safeUrl(u);
};
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
/* attributes for an <img>: Firestore images start blank and ans-cms.js fills them in as soon as they are loaded */
export const imgAttr = u => {
  const s = imgSrc(u);
  return /^cms-img:/.test(s) ? `src="${BLANK}" data-cms-img="${esc(s.slice(8))}"` : `src="${esc(s)}"${rawUrl(s) ? ` data-raw="${esc(rawUrl(s))}"` : ''}`;
};

/* tiny inline markup: **bold**  *italic*  [text](https://link)  and line breaks */
export const inline = t => esc(t)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const clean = safeUrl(url.replace(/&amp;/g, '&'));
    return clean ? `<a href="${esc(clean)}" target="_blank" rel="noopener">${label}</a>` : label;
  })
  .replace(/\n/g, '<br>');

/* GitHub Pages address (only for old images that were uploaded to the repo; new uploads live in Firestore) -> where uploaded images live in the repo (also used as a fallback while Pages is still deploying) */
export function ghInfo() {
  try {
    const saved = JSON.parse(localStorage.getItem('ans-cms-gh') || 'null');
    if (saved && saved.owner && saved.repo) return saved;
    const m = location.hostname.match(/^(.+)\.github\.io$/);
    if (m) return { owner: m[1], repo: location.pathname.split('/')[1] || `${m[1]}.github.io`, branch: 'main' };
  } catch (e) { /* not in a browser */ }
  return null;
}
export const rawUrl = src => {
  const g = ghInfo();
  return g && /^images\/cms\//.test(src) ? `https://raw.githubusercontent.com/${g.owner}/${g.repo}/${g.branch || 'main'}/${src}` : '';
};
const imgTag = (src, alt) => `<img ${imgAttr(src)} alt="${esc(alt || '')}" decoding="async">`;
const zoomAttr = (src, caption) => `data-cms-zoom="${esc(JSON.stringify({ src: imgSrc(src), caption: caption || '' }))}"`;

const USER_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>';

export function carouselInner(images, i) {
  const n = images.length;
  if (!n) return '';
  i = ((i % n) + n) % n;
  const g = images[i];
  return `<div class="g-car" tabindex="0" aria-label="Photo carousel"><div class="g-stage">${n > 1 ? '<button class="g-nav prev" data-cms-prev aria-label="Previous photo">←</button>' : ''}<button class="g-open" ${zoomAttr(g.src, g.caption)} aria-label="Zoom photo">${imgTag(g.src, g.caption)}</button>${n > 1 ? '<button class="g-nav next" data-cms-next aria-label="Next photo">→</button>' : ''}</div><p class="g-cap-line">${esc(g.caption || '')}</p><p class="g-counter">${i + 1} / ${n}</p>${n > 1 ? `<div class="g-thumbs">${images.map((t, k) => `<button class="g-thumb${k === i ? ' active' : ''}" data-cms-thumb="${k}" aria-label="Photo ${k + 1}">${imgTag(t.src, '')}</button>`).join('')}</div>` : ''}</div>`;
}

const R = {
  heading: b => { const l = +b.level === 3 ? 3 : 2; return `<h${l}>${esc(b.text)}</h${l}>`; },
  subtitle: b => `<p class="lead">${inline(b.text)}</p>`,
  paragraph: b => String(b.text || '').split(/\n{2,}/).filter(x => x.trim()).map(x => `<p>${inline(x)}</p>`).join(''),
  author: b => `<div class="guide-profile">${b.photo ? `<span class="cms-avatar">${imgTag(b.photo, b.name)}</span>` : USER_ICON}<div><h3>${esc(b.name)}</h3><small>${esc(b.role || '')}</small></div></div>`,
  tip: b => `<div class="elixir-callout"><p>${b.title ? `<strong>${esc(b.title)}</strong> ` : ''}${inline(b.text)}</p></div>`,
  warning: b => `<div class="elixir-callout warn"><p>${b.title ? `<strong>${esc(b.title)}</strong> ` : ''}${inline(b.text)}</p></div>`,
  image: b => b.src ? `<div class="shots cms-shot"><div class="film"><button class="btn c-open" ${zoomAttr(b.src, b.caption)} aria-label="Zoom image">${imgTag(b.src, b.alt || b.caption)}</button></div>${b.caption ? `<p class="empty">${esc(b.caption)}</p>` : ''}</div>` : '',
  gallery: b => {
    const imgs = (b.images || []).filter(x => x && x.src);
    if (!imgs.length) return '';
    if (b.layout === 'carousel') return `<div class="cms-car" data-cms-car data-i="0" data-imgs="${esc(JSON.stringify(imgs))}">${carouselInner(imgs, 0)}</div>`;
    return `<div class="g-wall">${imgs.map(g => `<button class="g-item" ${zoomAttr(g.src, g.caption)} aria-label="Open photo">${imgTag(g.src, g.caption)}${g.caption ? `<span class="g-cap">${esc(g.caption)}</span>` : ''}</button>`).join('')}</div>`;
  },
  list: b => {
    const items = (b.items || []).map(x => String(x).trim()).filter(Boolean);
    const tag = b.style === 'ol' ? 'ol' : 'ul';
    return items.length ? `<${tag}>${items.map(x => `<li>${inline(x)}</li>`).join('')}</${tag}>` : '';
  },
  table: b => {
    const rows = String(b.text || '').split('\n').filter(x => x.trim()).map(r => r.split('|').map(c => c.trim()));
    if (!rows.length) return '';
    const head = b.header !== false ? `<thead><tr>${rows[0].map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
    const body = (b.header !== false ? rows.slice(1) : rows).map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
    return `<div class="gear-table-wrap"><table class="pt cms-table">${head}<tbody>${body}</tbody></table></div>`;
  },
  quote: b => `<blockquote class="cms-quote"><p>${inline(b.text)}</p>${b.cite ? `<cite>— ${esc(b.cite)}</cite>` : ''}</blockquote>`,
  divider: () => '<div class="ornament" aria-hidden="true"><span>★</span></div>',
  button: b => {
    const url = safeUrl(b.url);
    return url ? `<p class="cms-btn-row"><a class="btn${b.style === 'primary' ? ' btn-primary' : ''}" href="${esc(url)}"${b.newTab === false ? '' : ' target="_blank" rel="noopener"'}>${esc(b.label || url)}</a></p>` : '';
  },
  accordion: b => `<details><summary>${esc(b.title)}</summary><div class="cms-details-body">${R.paragraph({ text: b.text })}${renderBlocks(b.blocks || [])}</div></details>`,
  container: b => `<section class="chapter cms-container">${b.title ? `<h2>${esc(b.title)}</h2>` : ''}${renderBlocks(b.blocks || [])}</section>`,
  columns: b => `<div class="cms-cols cms-cols-${(b.cols || []).length}">${(b.cols || []).map(c => `<div class="cms-col">${renderBlocks((c && c.blocks) || [])}</div>`).join('')}</div>`,
  html: b => String(b.code || '')   // raw HTML: only editors can write it (Firestore rules)
};

export function renderBlocks(blocks) {
  return (blocks || []).map(b => (b && R[b.type] ? R[b.type](b) : '')).join('');
}
/* a page body: .guide-body gives paragraphs/lists the same look as your guides */
export const wrapBlocks = blocks => `<div class="guide-body cms-blocks">${renderBlocks(blocks)}</div>`;
export const pageHead = (t, d) => `<div class="page-head reveal"><span class="eyebrow">ANS · SERVER #233</span><h1>${esc(t)}</h1><p>${esc(d || '')}</p></div>`;
export const pageHtml = (p, blocks) => `${pageHead(p.title, p.subtitle)}<section class="content reveal">${wrapBlocks(blocks)}</section>`;

/* small CSS for the few blocks that had no equivalent; it only uses your theme variables so both themes work */
export const CMS_CSS = `
.cms-quote{border-left:2px solid var(--primary);margin:18px 0;padding:6px 0 6px 18px;color:var(--muted-foreground);font-style:italic}
.cms-quote cite{display:block;margin-top:6px;font-style:normal;font-size:14px}
.cms-cols{display:grid;gap:24px;margin:14px 0}.cms-cols-2{grid-template-columns:repeat(2,1fr)}.cms-cols-3{grid-template-columns:repeat(3,1fr)}
@media(max-width:760px){.cms-cols{grid-template-columns:1fr!important}}
.cms-col{min-width:0}.cms-container{margin-top:34px;padding-top:24px}
.cms-btn-row{margin:16px 0}.cms-btn-row .btn{text-decoration:none}
.cms-details-body{padding:4px 0 20px}.cms-blocks .cms-shot{margin:18px 0}.cms-blocks img{max-width:100%}
.gear-table-wrap .pt.cms-table{min-width:0;width:100%}.cms-table th,.cms-table td{padding:8px 10px;text-align:left}
.cms-avatar{width:48px;height:48px;border-radius:50%;overflow:hidden;display:inline-flex;flex:0 0 auto}.cms-avatar img{width:100%;height:100%;object-fit:cover}
.cms-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 6%;border-bottom:1px solid var(--border);background:var(--surface)}
.cms-bar .btn{min-height:0;padding:7px 12px}`;
