/* ANS platform · pure logic (no DOM, no Firebase). Everything here is unit-tested in tools/test-logic.mjs.
   Page IDENTITY (node.id = the page key, or "cms-<firestoreId>") is separate from PLACEMENT (where the node sits in the tree). */

/* ---------- default navigation (the new ANS architecture). Ids of existing pages are UNCHANGED so every old URL still works. ---------- */
const N = (id, label, icon, access, children) => ({ id, label, icon: icon || '', access: access || 'inherit', hidden: false, children: children || [] });   // optional: desc (short text under the page title)
export const DEFAULT_NAV = () => [
  N('home', 'Home', 'home', 'public'),
  N('game', 'Game Compendium', 'book', 'public', [
    N('game-heroes', 'Heroes'), N('sanctuary', 'Buildings & Sanctuary'), N('game-resources', 'Resources'), N('gear', 'Gear & Equipment'), N('game-cross', 'Cross-Server Transfers'),
    N('server', 'Server Information', 'shield', 'inherit', [N('constitution', 'Server Constitution')])
  ]),
  N('guides', 'Guides & Strategies', 'book', 'members', [
    N('guide-beginners', "Beginner's Handbook", '', 'inherit', [N('guide-profile', 'Change Profile Picture & Name'), N('guide-help-members', 'Alliance Assistance'), N('guide-minister', 'Ministers'), N('guide-gift-codes', 'Gift Codes')]),
    N('guide-events', 'Event Strategies', '', 'inherit', [
      N('guide-elixir-dispute', 'Elixir Scramble'), N('guide-thief-hunt', 'Thief Hunt'), N('guide-crystal-valley', 'Crystal Valley'), N('guide-era-of-revival', 'Era of Revival'), N('guide-origin-curse', 'Origin of the Curse'),
      N('duel', 'Alliance Duel', '', 'inherit', [N('guide-sync-battle', 'Sync Survival Battle + Alliance Duel')]), N('guide-wisdom-trial', 'Wisdom Trial Quiz')
    ]),
    N('community-tips', 'Community Tips')
  ]),
  N('alliance', 'The Alliance', 'shield', 'members', [
    N('about', 'About ANS'), N('members', 'Alliance Members'), N('hall-of-fame', 'Hall of Fame'), N('gallery', 'ANS Gallery'), N('birthdays', 'Birthday Calendar'), N('black-book', 'Black Book')
  ]),
  N('nest', "The Raven's Nest", 'bell', 'members', [N('bulletin', "The Raven's Bulletin"), N('calendars', 'ANS Calendars'), N('upcoming', 'Upcoming Events'), N('archive', 'Announcements Archive'), N('checklists', 'Event Checklists')]),
  N('community', 'Community', 'castle', 'members', [N('tips', 'Share a Tip'), N('suggestions', 'Suggestions'), N('contributions', 'Community Contributions'), N('discussions', 'Discussions'), N('contact', 'Contact')])
];

/* ---------- tree helpers (all pure: they return new data or mutate only the array you pass) ---------- */
export const clone = x => JSON.parse(JSON.stringify(x));
export function walk(tree, fn, parent = null, depth = 0) { for (const n of tree) { fn(n, parent, depth); walk(n.children || [], fn, n, depth + 1); } }
export function find(tree, id) { let out = null; walk(tree, n => { if (n.id === id && !out) out = n; }); return out; }
export function parentOf(tree, id) { let out; walk(tree, (n, p) => { if (n.id === id && out === undefined) out = p; }); return out === undefined ? undefined : out; }   // null = top level, undefined = not found
export function pathTo(tree, id) { const out = []; let n = find(tree, id); while (n) { out.unshift(n.id); const p = parentOf(tree, n.id); n = p || null; } return out; }
export const ids = tree => { const s = []; walk(tree, n => s.push(n.id)); return s; };
export function isDescendant(tree, ancestorId, id) { const a = find(tree, ancestorId); if (!a) return false; return ids(a.children || []).includes(id); }
export function detach(tree, id) {
  const list = (n => n)(tree);
  const rm = arr => { const i = arr.findIndex(n => n.id === id); if (i >= 0) return arr.splice(i, 1)[0]; for (const n of arr) { const r = rm(n.children || []); if (r) return r; } return null; };
  return rm(list);
}
/* moves (or inserts) a node under parentId (null = top level) at index. Refuses to put a node inside itself. Returns true if done. */
export function place(tree, node, parentId, index) {
  if (parentId === node.id || (parentId && isDescendant([node], node.id, parentId))) return false;
  const target = parentId ? find(tree, parentId) : null;
  if (parentId && !target) return false;
  const arr = target ? (target.children = target.children || []) : tree;
  const i = index == null || index > arr.length ? arr.length : Math.max(0, index);
  arr.splice(i, 0, node); return true;
}
export function move(tree, id, parentId, index) {
  const node = find(tree, id); if (!node) return false;
  if (parentId && (parentId === id || isDescendant(tree, id, parentId))) return false;
  const snapshot = clone(tree);
  const taken = detach(tree, id);
  if (!place(tree, taken, parentId, index)) { tree.splice(0, tree.length, ...snapshot); return false; }
  return true;
}
export function shift(tree, id, dir) {           // ↑ / ↓ among siblings (the touch-friendly alternative to dragging)
  const p = parentOf(tree, id); if (p === undefined) return false;
  const arr = p ? p.children : tree, i = arr.findIndex(n => n.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]]; return true;
}
export function promote(tree, id) {              // one level up, right after its parent
  const p = parentOf(tree, id); if (!p) return false;
  const gp = parentOf(tree, p.id), at = (gp ? gp.children : tree).findIndex(n => n.id === p.id) + 1;
  return move(tree, id, gp ? gp.id : null, at);
}
export function addNode(tree, node, parentId) { if (find(tree, node.id)) return false; return place(tree, { id: node.id, label: node.label || node.id, icon: node.icon || '', access: node.access || 'inherit', hidden: !!node.hidden, ...(node.desc ? { desc: String(node.desc).slice(0, 200) } : {}), children: [] }, parentId || null, null); }
export function removeFromMenu(tree, id) {       // takes it OUT of the menu; the page itself is never deleted. Its children move up so nothing disappears.
  const n = find(tree, id); if (!n) return false;
  const p = parentOf(tree, id), arr = p ? p.children : tree, i = arr.findIndex(x => x.id === id);
  arr.splice(i, 1, ...(n.children || [])); return true;
}
/* effective access of a node: its own setting, else the nearest ancestor's, else members */
export function accessOf(tree, id) {
  const path = pathTo(tree, id);
  for (let i = path.length - 1; i >= 0; i--) { const a = find(tree, path[i])?.access; if (a === 'public' || a === 'members') return a; }
  return 'members';
}
/* can this role open this page? role: 'member' (approved / staff) | anything else = visitor. undefined = the tree does not know this page (let the old rules decide) */
export function canOpen(tree, role, page) {
  if (!find(tree, page)) return undefined;
  return accessOf(tree, page) === 'public' ? true : role === 'member';
}
export const visibleTree = (tree, role) => tree.map(n => ({ ...n, children: visibleTree(n.children || [], role) })).filter(n => !n.hidden && canOpen(tree, role, n.id) !== false);
/* pages that exist but are not in the menu (for the "Unplaced" tray in the Menu Manager) */
export const unplaced = (tree, allIds) => { const have = new Set(ids(tree)); return allIds.filter(x => !have.has(x)); };
/* a saved tree may be older than the code: keep it as it is, only drop malformed nodes */
export function sanitizeTree(tree, depth = 0, seen = new Set()) {   // ids must be unique across the WHOLE tree
  if (!Array.isArray(tree) || depth > 6) return [];
  return tree.filter(n => n && typeof n.id === 'string' && n.id && !seen.has(n.id) && seen.add(n.id)).map(n => ({
    id: String(n.id).slice(0, 80), label: String(n.label || n.id).slice(0, 80), icon: String(n.icon || '').slice(0, 20),
    access: ['public', 'members', 'inherit'].includes(n.access) ? n.access : 'inherit', hidden: !!n.hidden, ...(n.desc ? { desc: String(n.desc).slice(0, 200) } : {}), children: sanitizeTree(n.children, depth + 1, seen)
  }));
}

/* ---------- stable content ids (bookmarks, comments, search) ---------- */
export const refOf = page => page.startsWith('cms-') ? 'cms:' + page.slice(4) : page.startsWith('bulletin-') ? 'bulletin:' + page.slice(9) : 'page:' + page;
export const hashOf = ref => { const [t, ...r] = String(ref).split(':'), v = r.join(':'); return t === 'cms' ? '#cms-' + v : t === 'bulletin' ? '#bulletin-' + v : '#' + v; };
export const docIdOfRef = ref => String(ref).replace(/[^A-Za-z0-9_-]/g, '_');   // Firestore document id → one bookmark per user + content

/* ---------- time zones ---------- */
const dtf = {};
const fmt = tz => dtf[tz] || (dtf[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
export function tzOffsetMs(ms, tz) {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
/* "2026-11-20" + "18:30" typed in zone tz → UTC milliseconds */
export function zonedToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = String(dateStr).split('-').map(Number), [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  let utc = guess - tzOffsetMs(guess, tz); utc = guess - tzOffsetMs(utc, tz); return utc;
}
export function inZone(ms, tz) { const p = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, key: `${p.year}-${p.month}-${p.day}`, hm: `${String(+p.hour % 24).padStart(2, '0')}:${p.minute}` }; }
export const dayKey = (ms, tz) => inZone(ms, tz).key;
export const TZ_LIST = ['UTC', 'America/Mexico_City', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Madrid', 'Europe/Berlin', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];
export const validTz = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

/* ---------- calendar views ---------- */
export function monthGrid(year, month /* 0-11 */) {   // weeks (arrays of 7 'YYYY-MM-DD' | null), Sunday first
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay(), total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(), cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7)); return weeks;
}
export function weekDays(dateStr) {                    // the 7 days (Sun..Sat) containing dateStr
  const [y, m, d] = dateStr.split('-').map(Number), base = new Date(Date.UTC(y, m - 1, d)), s = new Date(base.getTime() - base.getUTCDay() * 864e5);
  return Array.from({ length: 7 }, (_, i) => new Date(s.getTime() + i * 864e5).toISOString().slice(0, 10));
}
export function groupByDay(events, tz) { const g = {}; events.forEach(e => { const k = dayKey(e.startMs, tz); (g[k] = g[k] || []).push(e); }); Object.values(g).forEach(a => a.sort((x, y) => x.startMs - y.startMs)); return g; }
export const upcoming = (events, nowMs, limit = 50) => events.filter(e => (e.endMs || e.startMs) >= nowMs).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.startMs - b.startMs).slice(0, limit);

/* ---------- ICS + Google Calendar ---------- */
const icsDate = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const fold = line => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
export function toICS(events, calName = 'ANS') {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ANS Server 233//Raven Nest//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc(calName)];
  events.forEach(e => {
    L.push('BEGIN:VEVENT', `UID:${e.id}@ans-233`, 'DTSTAMP:' + icsDate(Date.now()), 'DTSTART:' + icsDate(e.startMs), 'DTEND:' + icsDate(e.endMs || e.startMs + 36e5), 'SUMMARY:' + icsEsc(e.title));
    if (e.description) L.push('DESCRIPTION:' + icsEsc(e.description)); if (e.link) L.push('URL:' + e.link); L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR'); return L.map(fold).join('\r\n') + '\r\n';
}
export const googleLink = e => 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.title || '') + '&dates=' + icsDate(e.startMs) + '/' + icsDate(e.endMs || e.startMs + 36e5) + '&details=' + encodeURIComponent((e.description || '') + (e.link ? '\n' + e.link : ''));

/* ---------- search ---------- */
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const stripHtml = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
export function score(q, doc) {
  const terms = norm(q).split(/\s+/).filter(Boolean); if (!terms.length) return 0;
  const t = norm(doc.title), b = norm(doc.text || ''), c = norm(doc.category || ''); let s = 0;
  for (const w of terms) { if (t.includes(w)) s += t.startsWith(w) ? 12 : 8; else if (c.includes(w)) s += 3; else if (b.includes(w)) s += 1; else return 0; }   // every word must match somewhere
  return s;
}
export function snippet(text, q, len = 140) {
  const t = String(text || ''), i = norm(t).indexOf(norm(q).split(/\s+/)[0] || ''), at = i > 40 ? i - 40 : 0;
  return (at ? '…' : '') + t.slice(at, at + len).trim() + (t.length > at + len ? '…' : '');
}
export const searchIndex = (index, q, limit = 30) => index.map(d => ({ d, s: score(q, d) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.d);

/* ---------- checklists: progress is stored per member as { itemId: true }. Editing the template never wipes it. ---------- */
export function progress(template, done) {
  const items = (template.items || []).filter(i => !i.archived), d = done || {}, n = items.filter(i => d[i.id]).length;
  return { done: n, total: items.length, pct: items.length ? Math.round(n * 100 / items.length) : 0 };
}
export const toggleDone = (done, itemId, on) => { const d = { ...(done || {}) }; if (on) d[itemId] = true; else delete d[itemId]; return d; };

/* ---------- misc ---------- */
export const slugify = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';
export const toMs = v => !v ? 0 : typeof v === 'number' ? v : v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : Date.parse(v) || 0;
export const STATUS = { pending: 'Pending', review: 'Under Review', approved: 'Approved', rejected: 'Rejected', changes_requested: 'Changes Requested', published: 'Published' };
export const CONTRIB_TYPES = { tip: 'Tip', suggestion: 'Suggestion', info: 'Useful information', guide: 'Guide proposal', other: 'Other' };
/* reorder helper for plain arrays of {id,order} (cards, gallery, hall of fame, black book) */
export function reorderIds(list, fromId, toId) {
  const a = list.map(x => x.id), i = a.indexOf(fromId), j = a.indexOf(toId); if (i < 0 || j < 0 || i === j) return a;
  a.splice(j, 0, a.splice(i, 1)[0]); return a;
}
