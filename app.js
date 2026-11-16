// FrogShorts — Shorts legal dari Wikimedia Commons (≤60s, vertikal), akun wajib lokal
const feed = document.getElementById('feed');
const emptyState = document.getElementById('emptyState');
const statusBar = null;
const toastEl = document.getElementById('toast');

// ============ ACCOUNT (lokal per perangkat) ============
const ACCOUNTS_KEY = 'frogshorts-accounts';
const SESSION_KEY = 'frogshorts-session';
const ACC_LIKES = 'frogshorts-likes-';
const ACC_SAVES = 'frogshorts-saves-';

function loadAccounts() { try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch { return []; } }
function saveAccounts(list) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }
function session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function setSession(name) { name ? localStorage.setItem(SESSION_KEY, JSON.stringify({ name })) : localStorage.removeItem(SESSION_KEY); }
function currentUser() { const s = session(); return s ? s.name : null; }
function userKey(prefix) { const u = currentUser(); return u ? prefix + u : prefix + 'anon'; }
function loadSet(key) { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); } }
function saveSet(key, set) { localStorage.setItem(key, JSON.stringify([...set])); }
let likes = loadSet(userKey(ACC_LIKES));
let saves = loadSet(userKey(ACC_SAVES));
let dislikes = loadSet(userKey('frogshorts-dislikes-'));

function syncAccountData(user) {
  likes = loadSet(ACC_LIKES + user);
  saves = loadSet(ACC_SAVES + user);
  dislikes = loadSet('frogshorts-dislikes-' + user);
}
function persistAll() { const u = currentUser(); if (!u) return; saveSet(ACC_LIKES + u, likes); saveSet(ACC_SAVES + u, saves); saveSet('frogshorts-dislikes-' + u, dislikes); }

const gate = document.getElementById('accountGate');
const gateStepCreate = document.getElementById('gateStepCreate');
const gateStepLogin = document.getElementById('gateStepLogin');
const gateName = document.getElementById('gateName');
const gatePin = document.getElementById('gatePin');
const gatePinLogin = document.getElementById('gatePinLogin');
const gateBtnCreate = document.getElementById('gateCreateBtn');
const gateBtnLogin = document.getElementById('gateLoginBtn');
const gateSwitch = document.getElementById('gateSwitchBtn');
const gateWelcome = document.getElementById('gateWelcomeName');

function showGate() {
  const accounts = loadAccounts();
  if (accounts.length) {
    gateStepCreate.classList.add('hidden');
    gateStepLogin.classList.remove('hidden');
    const u = session();
    gateWelcome.textContent = u ? u.name : accounts[0].name;
    gatePinLogin.value = '';
  } else {
    gateStepCreate.classList.remove('hidden');
    gateStepLogin.classList.add('hidden');
    gateName.value = ''; gatePin.value = '';
  }
  gate.classList.remove('hidden');
}
function hideGate() { gate.classList.add('hidden'); }
function afterLogin(name) {
  setSession(name);
  syncAccountData(name);
  hideGate();
  loadFeed();
}

gateBtnCreate.addEventListener('click', () => {
  const name = gateName.value.trim();
  const pin = gatePin.value.trim();
  if (!name || name.length < 2) return showToast('isi nama kamu');
  if (!/^[0-9]{4}$/.test(pin)) return showToast('PIN harus 4 digit angka');
  const accounts = loadAccounts();
  if (accounts.find(a => a.name.toLowerCase() === name.toLowerCase())) return showToast('nama sudah dipakai');
  accounts.push({ name, pin, created: Date.now() });
  saveAccounts(accounts);
  afterLogin(name);
});
gateBtnLogin.addEventListener('click', () => {
  const accounts = loadAccounts();
  const u = session();
  const name = u ? u.name : accounts[0].name;
  const pin = gatePinLogin.value.trim();
  const acc = accounts.find(a => a.name === name);
  if (!acc) return showToast('akun tidak ditemukan');
  if (acc.pin !== pin) return showToast('PIN salah');
  afterLogin(name);
});
gateSwitch.addEventListener('click', () => {
  setSession(null);
  gateStepLogin.classList.add('hidden');
  gateStepCreate.classList.remove('hidden');
  gateName.value = ''; gatePin.value = '';
});

document.getElementById('btnAccount').addEventListener('click', () => {
  if (confirm('Keluar dari ' + (currentUser() || 'akun') + '?')) { setSession(null); showGate(); }
});

// ============ FEED (Commons, shorts only) ============
let items = [];
const seen = new Set();
let continueToken = null;
let loading = false;
const DEFAULT_QUERY = 'cartoon animation';   // banyak kartun & video AI
const FALLBACK_QUERIES = ['science animation', 'timelapse nature', 'AI animation', 'educational animation'];
let currentQuery = DEFAULT_QUERY;
let activeIndex = -1;

// 🚫 filter konten terlarang: porno, judi, dan sejenisnya
const BLOCKED = /porn|porno|sex(ual)?|nud(i|ity|e)|xxx|hentai|erotic|erotica|casino|gamble|gambl|judi|bet(ting)?|rummy|poker|strip|inces|milf|fetish|bondage/i;

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function stripHtml(s) { const d = document.createElement('div'); d.innerHTML = s || ''; return d.textContent || ''; }
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.add('hidden'), 2200);
}

async function fetchShortsPage(query, cont) {
  const base = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=filetype:video ' +
    encodeURIComponent(query) + '&gsrlimit=20&gsrnamespace=6&prop=videoinfo&viprop=url|size|width|height|duration|extmetadata&format=json&origin=*';
  const url = cont ? base + '&gsroffset=' + cont : base;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const cont2 = j.continue ? j.continue.gsroffset : null;
  const pages = j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
  const out = pages.map(p => {
    const vi = (p.videoinfo && p.videoinfo[0]) || {};
    const meta = vi.extmetadata || {};
    const artist = stripHtml(meta.Artist ? meta.Artist.value : '') || 'Commons';
    const license = meta.LicenseShortName ? meta.LicenseShortName.value : 'CC';
    const licenseUrl = (meta.LicenseUrl && meta.LicenseUrl.value) || 'https://creativecommons.org';
    const descUrl = vi.descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title || ''));
    return {
      title: (p.title || '').replace(/^File:/, ''),
      url: vi.url,
      width: vi.width || 0,
      height: vi.height || 0,
      duration: vi.duration || 999,
      size: vi.size || Infinity,
      artist, license, licenseUrl, descUrl
    };
  }).filter(v =>
    v.url &&
    v.duration <= 62 &&                 // shorts: maksimal ~60 detik
    v.size <= 60 * 1024 * 1024 &&       // harus muat & cepat diputar (≤60MB)
    !seen.has(v.url) &&
    /cc/i.test(v.license + '' + v.licenseUrl) &&
    !BLOCKED.test(v.title)              // 🚫 bukan porno/judi
  );
  return { items: out, next: cont2 };
}

async function loadFeed(reset) {
  if (loading) return;
  loading = true;
  if (reset) { items = []; seen.clear(); continueToken = null; activeIndex = -1; feed.innerHTML = ''; emptyState.classList.add('hidden'); }
  try {
    const { items: fresh, next } = await fetchShortsPage(currentQuery, continueToken);
    fresh.forEach(v => seen.add(v.url));
    items = items.concat(fresh);
    continueToken = next;
    if (!items.length) {
      // coba query cadangan berikutnya
      const i = FALLBACK_QUERIES.indexOf(currentQuery);
      const nextQuery = FALLBACK_QUERIES[i + 1] || FALLBACK_QUERIES[0];
      if (currentQuery !== nextQuery) { currentQuery = nextQuery; loading = false; return loadFeed(true); }
      emptyState.classList.remove('hidden'); loading = false; return;
    }
    appendSlides(items.length - fresh.length);
    loading = false;
  } catch (e) { showToast('gagal memuat: ' + e.message); loading = false; }
}

function appendSlides(from) {
  for (let i = from; i < items.length; i++) {
    const v = items[i];
    const slide = document.createElement('section');
    slide.className = 'slide';
    slide.dataset.index = i;
    slide.innerHTML = `
      <video src="${escapeHtml(v.url)}" playsinline muted loop preload="metadata" webkit-playsinline></video>
      <div class="scrim"></div>
      <div class="caption">
        <h3>${escapeHtml(v.title)}</h3>
        <div class="byline">${escapeHtml(v.artist.slice(0, 60))} · <a href="${escapeHtml(v.descUrl)}" target="_blank" rel="noopener license">Commons</a></div>
        <a class="lic-pill" href="${escapeHtml(v.licenseUrl)}" target="_blank" rel="noopener license">${escapeHtml(v.license)}</a>
      </div>`;
    feed.appendChild(slide);
    const vid = slide.querySelector('video');
    vid.addEventListener('error', () => { slide.remove(); if (feed.children.length < 4 && continueToken) loadFeed(false); });
    io.observe(slide);
  }
  if (activeIndex === -1) activateSlide(0);
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting && e.intersectionRatio > 0.6) activateSlide(+e.target.dataset.index);
    else { const v = e.target.querySelector('video'); if (v && !v.paused) v.pause(); }
  }
}, { root: feed, threshold: [0, 0.6] });

function activateSlide(i) {
  if (i === activeIndex) return;
  activeIndex = i;
  const slides = feed.children;
  for (let j = 0; j < slides.length; j++) {
    const v = slides[j].querySelector('video');
    if (j === i) v.play().catch(() => {}); else if (!v.paused) v.pause();
  }
  updateActionState();
  // infinite load: 3 dari akhir -> muat lagi
  if (i >= items.length - 3 && continueToken) loadFeed(false);
}

// ============ ACTIONS ============
const btnLike = document.getElementById('btnLike');
const btnDislike = document.getElementById('btnDislike');
const btnSave = document.getElementById('btnSave');
const btnShare = document.getElementById('btnShare');
const likeCount = document.getElementById('likeCount');
const dislikeCount = document.getElementById('dislikeCount');
const saveLabel = document.getElementById('saveLabel');

function currentUrl() { const s = feed.children[activeIndex]; return s ? s.querySelector('video').src : null; }
function updateActionState() {
  const url = currentUrl();
  if (!url) return;
  btnLike.classList.toggle('active', likes.has(url));
  btnDislike.classList.toggle('active', dislikes.has(url));
  btnSave.classList.toggle('active', saves.has(url));
  likeCount.textContent = likes.has(url) ? '1' : '0';
  dislikeCount.textContent = dislikes.has(url) ? '1' : '0';
  saveLabel.textContent = saves.has(url) ? 'Tersimpan' : 'Simpan';
}

btnLike.addEventListener('click', () => {
  const url = currentUrl(); if (!url) return;
  likes.has(url) ? likes.delete(url) : likes.add(url);
  if (likes.has(url)) dislikes.delete(url);
  persistAll(); updateActionState();
  showToast(likes.has(url) ? 'disukai' : 'batal suka');
});
btnDislike.addEventListener('click', () => {
  const url = currentUrl(); if (!url) return;
  dislikes.has(url) ? dislikes.delete(url) : dislikes.add(url);
  if (dislikes.has(url)) likes.delete(url);
  persistAll(); updateActionState();
  showToast(dislikes.has(url) ? 'tidak suka' : 'batal');
});
btnSave.addEventListener('click', () => {
  const url = currentUrl(); if (!url) return;
  saves.has(url) ? saves.delete(url) : saves.add(url);
  persistAll(); updateActionState();
  showToast(saves.has(url) ? 'tersimpan di akunmu' : 'batal simpan');
});
btnShare.addEventListener('click', async () => {
  const v = items[activeIndex]; if (!v) return;
  const data = { title: v.title, text: v.title + ' — via FrogShorts', url: v.descUrl };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); showToast('link disalin'); } } catch {}
});

document.getElementById('btnReload').addEventListener('click', () => { currentQuery = DEFAULT_QUERY; loadFeed(true); });

document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const t = Math.min(Math.max(activeIndex + (e.key === 'ArrowDown' ? 1 : -1), 0), feed.children.length - 1);
    feed.children[t].scrollIntoView({ behavior: 'smooth' });
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// start
const u = session();
if (u && loadAccounts().find(a => a.name === u.name)) { syncAccountData(u.name); hideGate(); loadFeed(); }
else showGate();
