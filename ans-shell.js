// ANS shell: vistas sin recargar + barras + ajustes (notificaciones / instalar) + constitución editable
// FASE 1: la protección por usuario/contraseña es solo visual hasta conectar Firebase (fase 2).
const ANS = {
  protect: false,                 // pasa a true cuando conectemos Firebase Auth
  locked: ['alliance-duel', 'sanctuary', 'weapons', 'ideas'],
  user: null                      // fase 2: { name, rank } desde Firebase
};

const VIEWS = {
  home:         { label: 'Home',    icon: '🏰', el: 'about-ans' },
  profile:      { label: 'Perfil',  icon: '👤', build: buildProfile },
  settings:     { label: 'Ajustes', icon: '⚙️', build: buildSettings },
  'alliance-duel': { label: 'Alliance Duel', icon: '⚔️', el: 'alliance-duel' },
  sanctuary:    { label: 'Sanctuary', icon: '⛪', el: 'sanctuary' },
  weapons:      { label: 'Weapons', icon: '🗡️', el: 'weapons' },
  constitution: { label: 'Server Constitution', icon: '📜', build: buildConstitution },
  ideas:        { label: 'Any ideas?', icon: '💡', href: 'https://forms.cloud.microsoft/r/nCfEWWHfsM' }
};

/* ---------- armar estructura ---------- */
const wrap = document.querySelector('.wrap');
const app = document.createElement('div');
app.className = 'app';
wrap.parentNode.insertBefore(app, wrap);
app.appendChild(wrap);

// secciones nuevas
['profile', 'settings', 'constitution'].forEach(id => {
  const s = document.createElement('section');
  s.id = 'v-' + id; s.className = 'tab';
  wrap.insertBefore(s, wrap.querySelector('script') || null);
});
const elOf = k => document.getElementById(VIEWS[k].el || 'v-' + k);

// barra lateral derecha
const side = document.createElement('aside');
side.className = 'side';
side.innerHTML = '<h3>ANS</h3>' + ['alliance-duel', 'sanctuary', 'weapons', 'constitution', 'ideas'].map(k =>
  `<a data-v="${k}" class="${ANS.locked.includes(k) ? 'lock' : ''}">${VIEWS[k].icon} ${VIEWS[k].label}</a>`).join('');
app.appendChild(side);

// barra inferior
const bottom = document.createElement('nav');
bottom.className = 'bottom';
bottom.innerHTML = ['home', 'profile', 'settings'].map(k =>
  `<a data-v="${k}"><span class="i">${VIEWS[k].icon}</span>${VIEWS[k].label}</a>`).join('');
document.body.appendChild(bottom);

/* ---------- router ---------- */
function canAccess(k) { return !ANS.protect || !ANS.locked.includes(k) || ANS.user; }

function go(k) {
  const v = VIEWS[k]; if (!v) return;
  if (!canAccess(k)) { k = 'login'; }
  if (v.href && k !== 'login') { window.open(v.href, '_blank', 'noopener'); return; }
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('view-active'));
  if (k === 'login') { showLogin(); } else {
    if (v.build) v.build(elOf(k));
    elOf(k).classList.add('view-active');
  }
  document.querySelectorAll('[data-v]').forEach(a => a.classList.toggle('on', a.dataset.v === k));
  history.replaceState(null, '', '#' + k);
  scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-v]'); if (a) go(a.dataset.v);
});

/* ---------- vistas ---------- */
function showLogin() {
  const s = document.getElementById('v-profile');
  s.innerHTML = `<div class="card-box"><h3>🔒 Acceso solo para miembros</h3>
    <p class="msg">Ingresa con el usuario y contraseña que te dieron los líderes de ANS.</p>
    <input id="lg-u" placeholder="Usuario" autocomplete="username">
    <input id="lg-p" type="password" placeholder="Contraseña" autocomplete="current-password">
    <button class="btn" id="lg-b">Entrar</button><p class="msg" id="lg-m"></p></div>`;
  s.classList.add('view-active');
  document.getElementById('lg-b').onclick = () => {
    // FASE 2: aquí va signInWithEmailAndPassword de Firebase
    document.getElementById('lg-m').textContent = 'El inicio de sesión se activa al conectar Firebase.';
  };
}

function buildProfile(el) {
  el.innerHTML = `<h2>Perfil</h2><div class="card-box">
    <h3>${ANS.user ? ANS.user.name : 'Invitado'}</h3>
    <p class="msg">Rango: ${ANS.user ? ANS.user.rank : '—'}</p>
    ${ANS.user ? '' : '<button class="btn" onclick="go(\'alliance-duel\')">Iniciar sesión</button>'}
  </div>`;
}

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });

function buildSettings(el) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const canPost = ANS.user && ['R4', 'R5'].includes(ANS.user.rank);
  el.innerHTML = `<h2>Ajustes</h2>
  <div class="card-box"><h3>🔔 Notificaciones</h3>
    <div class="row"><span>Recibir avisos de ANS</span><button class="btn" id="st-n">Activar</button></div>
    <p class="msg" id="st-nm">${isIOS && !standalone ? 'En iPhone primero agrega ANS a la pantalla de inicio y ábrela desde el ícono.' : ''}</p></div>
  <div class="card-box"><h3>📱 Acceso directo</h3>
    <div class="row"><span>Instalar ANS en tu teléfono</span><button class="btn" id="st-i">Instalar</button></div>
    <p class="msg" id="st-im">${standalone ? 'Ya estás usando la app instalada.' : ''}</p></div>
  <div class="card-box"><h3>📢 Publicar anuncio</h3>
    ${canPost ? `<input id="an-t" placeholder="Título"><textarea id="an-b" rows="3" placeholder="Mensaje"></textarea>
      <button class="btn" id="an-s">Publicar y notificar</button>`
      : '<p class="msg">Solo R4 y R5 pueden publicar. Inicia sesión con tu cuenta.</p>'}</div>`;

  document.getElementById('st-n').onclick = async () => {
    if (!('Notification' in window)) return msg('st-nm', 'Tu navegador no soporta notificaciones.');
    const p = await Notification.requestPermission();
    msg('st-nm', p === 'granted' ? 'Notificaciones activadas.' : 'Permiso no concedido.');
    // FASE 2: aquí se obtiene el token FCM y se guarda en Firestore
  };
  document.getElementById('st-i').onclick = async () => {
    if (installEvt) { installEvt.prompt(); installEvt = null; }
    else if (isIOS) msg('st-im', 'En Safari: botón Compartir → "Agregar a pantalla de inicio".');
    else msg('st-im', 'Menú del navegador (⋮) → "Instalar app" / "Agregar a pantalla de inicio".');
  };
}
const msg = (id, t) => { document.getElementById(id).textContent = t; };

function buildConstitution(el) {
  // Edita este texto directamente aquí (fase 2: se guardará en Firestore y R5 lo editará desde la app)
  const TEXT = `Write the Server Constitution here.`;
  el.innerHTML = `<h2>Server Constitution</h2><div class="card-box"><p style="white-space:pre-wrap;text-align:justify">${TEXT}</p></div>`;
}

/* ---------- service worker + arranque ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
go(location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'home');
