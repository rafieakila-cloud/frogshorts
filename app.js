// FrogShorts — feed video vertikal legal (Wikimedia Commons)
const feed = document.getElementById('feed');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const cats = document.querySelectorAll('.chip');
const searchOverlay = document.getElementById('searchOverlay');
const btnSearch = document.getElementById('btnSearch');
const btnCloseSearch = document.getElementById('btnCloseSearch');
const searchForm = document.getElementById('searchForm');
const qInput = document.getElementById('q');
const btnLike = document.getElementById('btnLike');
const btnSource = document.getElementById('btnSource');
const likeCount = document.getElementById('likeCount');
const btnInstall = document.getElementById('btnInstall');

let videos = [];
let currentQuery = 'frog';
let activeIndex = -1;
let likes = JSON.parse(localStorage.getItem('frogshorts-likes') || '{}');

function setStatus(msg) {
  if (!msg) { statusBar.classList.add('hidden'); return; }
  statusText.textContent = msg;
  statusBar.classList.remove('hidden');
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function stripHtml(s) { const d = document.createElement('div'); d.innerHTML = s || ''; return d.textContent || ''; }
function saveLikes() { localStorage.setItem('frogshorts-likes', JSON.stringify(likes)); }
function liked(url) { return !!likes[url]; }
function totalLikesFor(url) { return liked(url) ? 1 : 0; }

async function fetchVideos(query, limit) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=filetype:video ' +
    encodeURIComponent(query) + '&gsrlimit=' + (limit || 12) + '&gsrnamespace=6&prop=videoinfo&viprop=url|size|extmetadata&format=json&origin=*';
  const r = await fetch(url, { headers: { 'User-Agent': 'FrogShorts/0.1' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const pages = j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
  return pages.map(p => {
    const vi = (p.videoinfo && p.videoinfo[0]) || {};
    const meta = vi.extmetadata || {};
    const artist = stripHtml(meta.Artist ? meta.Artist.value : '') || 'Wikipedia Commons';
    const license = meta.LicenseShortName ? meta.LicenseShortName.value : 'CC';
    const licenseUrl = (meta.LicenseUrl && meta.LicenseUrl.value) || 'https://creativecommons.org';
    const descUrl = vi.descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title || ''));
    const isFree = /cc/i.test(license) || /public domain|pd/i.test(license);
    return {
      title: (p.title || 'Video tanpa judul').replace(/^File:/, ''),
      url: vi.url,
      sizeMB: vi.size ? (vi.size / 1048576).toFixed(1) : null,
      artist, license, licenseUrl, descUrl, isFree
    };
  }).filter(v => v.url && v.isFree && /\.(webm|ogv|mp4|ogg)$/i.test(v.url.split('?')[0]));
}

function renderFeed() {
  feed.innerHTML = '';
  if (!videos.length) {
    feed.innerHTML = '<div class="empty"><div style="font-size:54px">○</div><div>Tidak ada video ditemukan.<br>Coba kata kunci lain, misal “nature timelapse” atau “Indonesia”.</div></div>';
    setStatus(null);
    return;
  }
  videos.forEach((v, i) => {
    const slide = document.createElement('section');
    slide.className = 'slide';
    slide.dataset.index = i;
    slide.innerHTML = `
      <video src="${escapeHtml(v.url)}" playsinline muted loop preload="metadata" loop webkit-playsinline></video>
      <div class="scrim"></div>
      <div class="meta">
        <h2>${escapeHtml(v.title)}</h2>
        <div class="credit">${escapeHtml(v.artist.slice(0, 70))} · <a href="${escapeHtml(v.descUrl)}" target="_blank" rel="noopener license">Commons</a></div>
        <a class="license-pill" style="text-decoration:none" href="${escapeHtml(v.licenseUrl)}" target="_blank" rel="noopener license">${escapeHtml(v.license)}</a>
      </div>`;
    feed.appendChild(slide);
  });
  observeSlides();
  setStatus(videos.length + ' video · ' + currentQuery);
  // mulai dari slide pertama
  feed.scrollTo({ top: 0 });
  activateSlide(0);
}

const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
      activateSlide(+entry.target.dataset.index);
    } else {
      const v = entry.target.querySelector('video');
      if (v && !v.paused) v.pause();
    }
  }
}, { root: feed, threshold: [0, 0.6] });

function observeSlides() {
  document.querySelectorAll('.slide').forEach(s => io.observe(s));
}

function activateSlide(i) {
  if (i === activeIndex) return;
  activeIndex = i;
  const slide = feed.children[i];
  if (!slide) return;
  const v = slide.querySelector('video');
  if (v) v.play().catch(() => {});
  btnLike.classList.toggle('liked', liked(v.src));
  likeCount.textContent = totalLikesFor(v.src);
}

btnLike.addEventListener('click', () => {
  const slide = feed.children[activeIndex];
  if (!slide) return;
  const url = slide.querySelector('video').src;
  if (likes[url]) delete likes[url]; else likes[url] = true;
  saveLikes();
  btnLike.classList.toggle('liked', !!likes[url]);
  likeCount.textContent = likes[url] ? 1 : 0;
});

btnSource.addEventListener('click', () => {
  const v = videos[activeIndex];
  if (v) window.open(v.descUrl, '_blank', 'noopener');
});

cats.forEach(c => c.addEventListener('click', () => {
  cats.forEach(x => x.classList.toggle('active', x === c));
  loadFeed(c.dataset.cat);
}));

btnSearch.addEventListener('click', () => { searchOverlay.classList.remove('hidden'); setTimeout(() => qInput.focus(), 50); });
btnCloseSearch.addEventListener('click', () => searchOverlay.classList.add('hidden'));
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = qInput.value.trim();
  if (!q) return;
  searchOverlay.classList.add('hidden');
  cats.forEach(x => x.classList.remove('active'));
  loadFeed(q);
});

async function loadFeed(query) {
  currentQuery = query;
  setStatus('memuat…');
  try {
    videos = await fetchVideos(query, 15);
    if (!videos.length && query !== 'timelapse') videos = await fetchVideos('timelapse nature', 15);
    renderFeed();
  } catch (e) {
    feed.innerHTML = '<div class="empty">Gagal memuat: ' + escapeHtml(e.message) + '</div>';
    setStatus(null);
  }
}

// PWA install
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); btnInstall.classList.remove('hidden'); window._dip = e; });
btnInstall.addEventListener('click', async () => { if (window._dip) { window._dip.prompt(); window._dip = null; btnInstall.classList.add('hidden'); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// keyboard nav (desktop): arrow up/down
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const target = Math.min(Math.max(activeIndex + (e.key === 'ArrowDown' ? 1 : -1), 0), feed.children.length - 1);
  feed.children[target].scrollIntoView({ behavior: 'smooth' });
});

loadFeed('frog');
