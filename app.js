// =====================================================================
// CONFIG — edit this block to manage access
// =====================================================================

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjd0qi4vnm8rLuYE-J01S4Lgki9zy_CXcO16kZqc2G9n2OLBx0fOITQUSY1hGUiNol-eL5tDrrLGPj/pub?gid=212796903&single=true&output=csv';

// ── Access levels ─────────────────────────────────────────────────────
// 'admin' → sees everything including phone, address, email
// 'guest' → HIDDEN_FOR_GUEST fields are masked
const PASSWORDS = {
  'Admin@KM2025': 'admin',   // ← change these passwords freely
  'Guest@KM2025': 'guest',
};

// ── Fields to hide from guest access ─────────────────────────────────
// Add or remove CSV column names — must match the header exactly
const HIDDEN_FOR_GUEST = [
  'Phone Number',
  'Address',
  'Email Address',
];

// ── How masked values appear to guests ───────────────────────────────
const MASK_FN = {
  'Phone Number':  v => v.replace(/\d(?=\d{4})/g, '•'),           // ••••••7890
  'Address':       v => v.trim().split(/[\s,]+/)[0] + ' …',        // Bangalore …
  'Email Address': v => { const [u,d]=v.split('@'); return u.slice(0,2)+'••@'+(d||''); },
};

// =====================================================================

const IMG_EXTENSIONS  = ['jpg', 'jpeg', 'png', 'webp'];
const HORO_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

let allProfiles  = [];
let filtered     = [];
let activeFilter = 'all';
let currentRole  = null;  // null = not logged in | 'admin' | 'guest'
// ── File path helpers ────────────────────────────────────────────────

function profileFolder(uid) {
  return `./profiles/${uid.trim()}`;
}

function photoCandidates(uid, slot) {
  const base = profileFolder(uid);
  // Try multiple naming conventions: photo1.jpg, 1.jpg, Photo1.jpg, IMG_1.jpg etc.
  const names = [`photo${slot}`, `${slot}`, `Photo${slot}`, `image${slot}`, `img${slot}`];
  const paths = [];
  for (const name of names) {
    for (const ext of IMG_EXTENSIONS) {
      paths.push(`${base}/${name}.${ext}`);
    }
  }
  return paths;
}

function horoscopeCandidates(uid) {
  return HORO_EXTENSIONS.map(ext => `${profileFolder(uid)}/horoscope.${ext}`);
}

async function urlExists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

async function findHoroscope(uid) {
  for (const url of horoscopeCandidates(uid)) {
    if (await urlExists(url)) return url;
  }
  return null;
}

// ── Image with fallback extensions ───────────────────────────────────

// localCandidates: UID-prefixed local paths tried first
// driveUrl: raw Google Drive URL from CSV — used only if all local paths fail
function buildImgWithFallback(localCandidates, driveUrl, placeholderSymbol) {
  const all = [...localCandidates];
  const driveFallback = driveViewUrl(driveUrl);
  if (driveFallback) all.push(driveFallback);
  const candidatesAttr = all.join('|');
  return `<img
    src="${all[0]}"
    data-candidates="${candidatesAttr}"
    data-idx="0"
    onerror="tryNextImg(this,'${placeholderSymbol}')"
    onclick="openLightbox(this)"
    style="width:100%;height:100%;object-fit:contain;display:block;cursor:zoom-in;background:#1a100a08"
    alt="Profile photo"
  >`;
}
function tryNextImg(img, symbol) {
  const candidates = img.dataset.candidates.split('|');
  let idx = parseInt(img.dataset.idx) + 1;
  if (idx < candidates.length) {
    img.dataset.idx = idx;
    img.src = candidates[idx];
  } else {
    img.parentElement.innerHTML = `<div class="img-placeholder">${symbol}</div>`;
  }
}

// ── CSV parser ────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, idx) => { obj[h.trim()] = (vals[idx] || '').trim(); });
    if (obj['Unique ID']) rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// ── Utilities ─────────────────────────────────────────────────────────

function getAge(dob) {
  if (!dob) return '—';
  const parts = dob.split(/[\/\-\s]/);
  let d;
  if (parts.length === 3) {
    const n = parts.map(Number);
    if (n[2] > 1900) d = new Date(n[2], n[0]-1, n[1]);
    else if (n[0] > 1900) d = new Date(n[0], n[1]-1, n[2]);
    else d = new Date(n[2], n[1]-1, n[0]);
  } else { d = new Date(dob); }
  if (isNaN(d)) return '—';
  const age = Math.floor((Date.now() - d) / (365.25*24*60*60*1000));
  return age > 0 && age < 120 ? age + ' yrs' : '—';
}

// Convert a Google Drive share/view URL to a direct download URL
function driveDirectUrl(url) {
  if (!url) return null;
  const m = url.match(/\/d\/([^\/\?&]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  const m2 = url.match(/id=([^&]+)/);
  if (m2) return `https://drive.google.com/uc?export=download&id=${m2[1]}`;
  return url;
}

function driveViewUrl(url) {
  if (!url) return null;
  const m = url.match(/\/d\/([^\/\?&]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w600`;
  const m2 = url.match(/id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w600`;
  return url;
}

function extFromUrl(url) {
  const lower = (url || '').toLowerCase();
  if (lower.includes('.pdf')) return 'pdf';
  if (lower.includes('.png')) return 'png';
  if (lower.includes('.webp')) return 'webp';
  return 'jpg';
}

// ── Card renderer ─────────────────────────────────────────────────────

function createCard(p) {
  const uid    = p['Unique ID'].trim();
  const isBride = p['Filling the Form Of'] === 'Bride';
  const type   = isBride ? 'bride' : 'groom';
  const cardId = 'card-' + uid.replace(/[^a-z0-9]/gi, '');
  const age    = getAge(p['Date Of Birth']);
  const symbol = isBride ? '♀' : '♂';
  const drivePhoto1 = p['Photo 1 - of Bride or Groom'] || '';
  const drivePhoto2 = p['Photo 2 - of Bride or Groom'] || '';

  return `
    <div class="profile-card ${type}" id="${cardId}">
      <div class="card-images">
        <div class="image-slider" id="${cardId}-slider">
          <div class="image-slide active" data-idx="0">
            ${buildImgWithFallback(photoCandidates(uid, 1), drivePhoto1, symbol)}
          </div>
          <div class="image-slide" data-idx="1">
            ${buildImgWithFallback(photoCandidates(uid, 2), drivePhoto2, symbol)}
          </div>
          <button class="img-arrow prev" onclick="prevSlide('${cardId}')">‹</button>
          <button class="img-arrow next" onclick="nextSlide('${cardId}')">›</button>
          <div class="img-count-badge"><span class="${cardId}-cur">1</span>/2</div>
          <div class="img-nav">
            <button class="img-dot active" onclick="goSlide('${cardId}',0)"></button>
            <button class="img-dot"        onclick="goSlide('${cardId}',1)"></button>
          </div>
        </div>
      </div>

      <div class="card-details">
        <div class="card-header">
          <div class="name-row">
            <div class="profile-name">${p['Name'] || '—'}</div>
            <div class="profile-id">${uid}</div>
          </div>
          <div class="tag-row">
            <span class="tag ${type}">${p['Filling the Form Of']}</span>
            ${age !== '—' ? `<span class="tag neutral">${age}</span>` : ''}
            ${p['Height (in feet) - example 5 / 5`2 / 5`11'] ? `<span class="tag neutral">${p['Height (in feet) - example 5 / 5`2 / 5`11']}</span>` : ''}
            ${p['Rashi']    ? `<span class="tag neutral">${p['Rashi']}</span>`    : ''}
            ${p['Nakshatra']? `<span class="tag green">${p['Nakshatra']}</span>` : ''}
          </div>
        </div>

        <div class="card-scroll">
          <div class="detail-section">
            <div class="section-label">Personal</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">DOB</div><div class="detail-val">${p['Date Of Birth']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Birth Place</div><div class="detail-val">${p['Place of Birth']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Gothra</div><div class="detail-val">${p['Gothra']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Sub-Caste</div><div class="detail-val">${p['Sub Caste']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Mata</div><div class="detail-val">${p['ಮಠ - Mata']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Charana</div><div class="detail-val">${p['Charana']||'—'}</div></div>
            </div>
          </div>
          <div class="divider"></div>
          <div class="detail-section">
            <div class="section-label">Professional</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">Education</div><div class="detail-val">${p['Education ']||p['Education']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Field</div><div class="detail-val">${p['Work Field']||'—'}</div></div>
              <div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Company / Role</div><div class="detail-val">${p['Currently Working-In(Company Name) and As(Position)']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Salary</div><div class="detail-val">${p['Salary(LPA)']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Degree</div><div class="detail-val">${p['Mention your degrees ']||p['Mention your degrees']||'—'}</div></div>
            </div>
          </div>
          <div class="divider"></div>
          <div class="detail-section">
            <div class="section-label">Family</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">Father</div><div class="detail-val">${p["Father's Name"]||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Occ.</div><div class="detail-val">${p['Occupation ']||p['Occupation']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Mother</div><div class="detail-val">${p["Mother's Name"]||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Siblings</div><div class="detail-val">${p['Siblings']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Father's Native</div><div class="detail-val">${p["Father's Native"]||'—'}</div></div>
            </div>
          </div>
          <div class="divider"></div>
          <div class="detail-section">
            <div class="section-label">Preferences</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">Currently In</div><div class="detail-val">${p['Staying In']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Relocation</div><div class="detail-val">${p['Planning To Relocate']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Age Gap</div><div class="detail-val">${p['Age Gap']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Abroad</div><div class="detail-val">${p['Abroad Relocation']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Language</div><div class="detail-val">${p['Language Preference ']||p['Language Preference']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Same Gothra</div><div class="detail-val">${p['Will agree on Same Gothra']||'—'}</div></div>
            </div>
          </div>
          <div class="divider"></div>
          <div class="detail-section">
            <div class="section-label">Contact</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">Phone</div><div class="detail-val">${p['Phone Number']||'—'}</div></div>
              <div class="detail-item"><div class="detail-key">Email</div><div class="detail-val" style="word-break:break-all">${p['Email Address']||'—'}</div></div>
              <div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Address</div><div class="detail-val">${p['Address']||'—'}</div></div>
            </div>
          </div>
        </div>

        <div class="card-footer">
          <span id="${cardId}-horo">
            <button class="horoscope-btn" style="opacity:0.4;cursor:not-allowed" disabled>✦ No Horoscope</button>
          </span>
          <button class="contact-btn" onclick="openModal('${uid}')">⊞ Full Details</button>
        </div>
      </div>
    </div>
  `;
}

async function injectHoroscopeButtons() {
  for (const p of filtered) {
    const uid    = p['Unique ID'].trim();
    const cardId = 'card-' + uid.replace(/[^a-z0-9]/gi, '');
    const slot   = document.getElementById(`${cardId}-horo`);
    if (!slot) continue;
    const url = await findHoroscope(uid);
    if (url) slot.innerHTML = `<a class="horoscope-btn" href="${url}" target="_blank">✦ View Horoscope</a>`;
  }
}

// ── Slide logic ───────────────────────────────────────────────────────

function goSlide(id, idx) {
  const slider = document.getElementById(id + '-slider');
  if (!slider) return;
  slider.querySelectorAll('.image-slide').forEach((s,i) => s.classList.toggle('active', i === idx));
  slider.querySelectorAll('.img-dot').forEach((d,i) => d.classList.toggle('active', i === idx));
  const cur = slider.querySelector(`.${id}-cur`);
  if (cur) cur.textContent = idx + 1;
}

function nextSlide(id) {
  const slider = document.getElementById(id + '-slider');
  if (!slider) return;
  const slides = slider.querySelectorAll('.image-slide');
  const cur = Array.from(slides).findIndex(s => s.classList.contains('active'));
  goSlide(id, (cur + 1) % slides.length);
}

function prevSlide(id) {
  const slider = document.getElementById(id + '-slider');
  if (!slider) return;
  const slides = slider.querySelectorAll('.image-slide');
  const cur = Array.from(slides).findIndex(s => s.classList.contains('active'));
  goSlide(id, (cur - 1 + slides.length) % slides.length);
}

// ── Modal ─────────────────────────────────────────────────────────────

async function openModal(uid) {
  const p = allProfiles.find(x => x['Unique ID'].trim() === uid);
  if (!p) return;

  document.getElementById('modal-name').textContent = p['Name'] || '—';
  document.getElementById('modal-id').textContent =
    uid + ' · ' + p['Filling the Form Of'] + ' · Registered ' + (p['Timestamp'] || '').split(' ')[0];

  const skip = new Set([
    'Photo 1 - of Bride or Groom','Photo 2 - of Bride or Groom','Horoscope',
    '* I Herby declare that the above particulars furnished is true and correct for the best of my knowledge and for the purpose of finding bride/ groom for self or family members only and will not use profiles for any commercial purposes including agent activities/ brokerage activities or sharing and forwarding to other groups or platforms. I Accept all terms and conditions of Kathyayini Matrimony Services'
  ]);

  const rows = Object.entries(p)
    .filter(([k,v]) => v && v.trim() && !skip.has(k))
    .map(([k,v]) => `
      <div class="modal-detail-row">
        <div class="modal-key">${k.replace(/\s+/g,' ').trim()}</div>
        <div class="modal-val">${fieldValue(k, v)}</div>
      </div>`).join('');

  const horoUrl = await findHoroscope(uid, p['Horoscope'] || '');
  const horoRow = horoUrl ? `
    <div class="modal-detail-row">
      <div class="modal-key">Horoscope</div>
      <div class="modal-val"><a href="${horoUrl}" target="_blank" style="color:var(--gold)">Open Horoscope ↗</a></div>
    </div>` : '';

  document.getElementById('modal-body').innerHTML = rows + horoRow;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ── Download Manager ──────────────────────────────────────────────────

function openDownloadManager() {
  renderDlList();
  document.getElementById('dl-overlay').classList.add('open');
}

function closeDownloadManager() {
  document.getElementById('dl-overlay').classList.remove('open');
}

document.getElementById('dl-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeDownloadManager();
});

function renderDlList() {
  const query = (document.getElementById('dl-search')?.value || '').toLowerCase();
  const profiles = allProfiles.filter(p =>
    !query ||
    (p['Name'] || '').toLowerCase().includes(query) ||
    (p['Unique ID'] || '').toLowerCase().includes(query)
  );

  const list = document.getElementById('dl-list');
  if (!profiles.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-dim)">No profiles found</div>`;
    return;
  }

  list.innerHTML = profiles.map(p => {
    const uid  = p['Unique ID'].trim();
    const name = p['Name'] || '—';
    const photo1 = p['Photo 1 - of Bride or Groom'];
    const photo2 = p['Photo 2 - of Bride or Groom'];
    const horo   = p['Horoscope'];

    const tags = [
      photo1 ? `<span class="dl-tag photo">photo1</span>` : '',
      photo2 ? `<span class="dl-tag photo">photo2</span>` : '',
      horo   ? `<span class="dl-tag horo">horoscope</span>` : '',
    ].filter(Boolean).join('');

    const hasAny = photo1 || photo2 || horo;

    return `
      <div class="dl-row">
        <div class="dl-info">
          <div class="dl-name">${name}</div>
          <div class="dl-uid">${uid}</div>
          <div class="dl-files">${tags || '<span style="font-size:11px;color:var(--text-dim)">No files in sheet</span>'}</div>
        </div>
        <button class="dl-btn" ${hasAny ? '' : 'disabled'}
          onclick="downloadProfileZip('${uid}')">
          ⬇ ZIP
        </button>
      </div>
    `;
  }).join('');
}

async function downloadProfileZip(uid) {
  const p = allProfiles.find(x => x['Unique ID'].trim() === uid);
  if (!p) return;

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Fetching…';

  try {
    const zip = new JSZip();
    const folder = zip.folder(uid);

    // Files named photo1/photo2/horoscope inside profiles/<UID>/ folder
    // so the ZIP can be extracted directly into the GitHub repo
    const files = [
      { url: p['Photo 1 - of Bride or Groom'], name: 'photo1' },
      { url: p['Photo 2 - of Bride or Groom'], name: 'photo2' },
      { url: p['Horoscope'],                   name: 'horoscope' },
    ].filter(f => f.url && f.url.trim());

    let added = 0;
    for (const f of files) {
      try {
        const directUrl = driveDirectUrl(f.url);
        const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(directUrl);
        btn.textContent = `Fetching ${f.name}…`;
        const resp = await fetch(proxyUrl);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        // Determine extension from MIME type or URL
        let ext = 'jpg';
        const mime = blob.type || '';
        if (mime.includes('pdf'))       ext = 'pdf';
        else if (mime.includes('png'))  ext = 'png';
        else if (mime.includes('webp')) ext = 'webp';
        else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
        else ext = extFromUrl(f.url);

        // file goes into profiles/UID/photo1.jpg — drop the whole zip into repo root
        folder.file(`${f.name}.${ext}`, blob);
        added++;
      } catch (e) { /* skip failed file */ }
    }

    if (added === 0) {
      alert('Could not fetch any files. Make sure Google Drive links are set to "Anyone with the link can view".');
      btn.disabled = false;
      btn.textContent = '⬇ ZIP';
      return;
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `profiles_${uid}.zip`;  // Extract into repo root — creates profiles/UID/photo1.jpg
    a.click();
    URL.revokeObjectURL(a.href);

  } catch (e) {
    alert('Download failed: ' + e.message);
  }

  btn.disabled = false;
  btn.textContent = '⬇ ZIP';
}

// ── Search clear button ───────────────────────────────────────────────

function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('search-clear').classList.remove('visible');
  applyFilters();
  input.focus();
}

document.getElementById('search-input').addEventListener('input', function() {
  const clearBtn = document.getElementById('search-clear');
  clearBtn.classList.toggle('visible', this.value.length > 0);
  applyFilters();
});

// ── Filters ───────────────────────────────────────────────────────────

function applyFilters() {
  const search   = document.getElementById('search-input').value.toLowerCase().trim();
  const caste    = document.getElementById('caste-filter').value;
  const location = document.getElementById('location-filter').value;
  const sort     = document.getElementById('sort-select').value;

  filtered = allProfiles.filter(p => {
    if (activeFilter !== 'all' && p['Filling the Form Of'] !== activeFilter) return false;
    if (caste && p['Sub Caste'] !== caste) return false;
    if (location) {
      const loc  = p['Staying In'] || '';
      const city = p['If currently not staying in Bengaluru Please mention the city'] || '';
      if (!loc.toLowerCase().includes(location.toLowerCase()) &&
          !city.toLowerCase().includes(location.toLowerCase())) return false;
    }
    if (search) {
      const s = [p['Name'], p['Gothra'], p['Nakshatra'], p['Sub Caste'],
        p['Work Field'], p['Currently Working-In(Company Name) and As(Position)'],
        p['Rashi'], p['Education '], p['ಮಠ - Mata'], p['Place of Birth']
      ].join(' ').toLowerCase();
      if (!s.includes(search)) return false;
    }
    return true;
  });

  if (sort === 'newest') filtered.sort((a,b) => new Date(b['Timestamp']) - new Date(a['Timestamp']));
  else if (sort === 'oldest') filtered.sort((a,b) => new Date(a['Timestamp']) - new Date(b['Timestamp']));
  else if (sort === 'name') filtered.sort((a,b) => (a['Name']||'').localeCompare(b['Name']||''));

  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('grid');
  document.getElementById('results-count').textContent = filtered.length;
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><div>No profiles match your filters</div></div>`;
    return;
  }
  grid.innerHTML = filtered.map(createCard).join('');
  injectHoroscopeButtons();
}

function populateFilters() {
  const castes = [...new Set(allProfiles.map(p => p['Sub Caste']).filter(Boolean))].sort();
  const casteEl = document.getElementById('caste-filter');
  castes.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; casteEl.appendChild(o); });

  const locations = [...new Set(allProfiles.map(p => p['Staying In']).filter(Boolean))].sort();
  const locEl = document.getElementById('location-filter');
  locations.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; locEl.appendChild(o); });
}

// ── Load data ─────────────────────────────────────────────────────────

// ── App init ──────────────────────────────────────────────────────────

function initApp() {
  // Rebuild the full page if we replaced it with the login screen
  if (document.getElementById('login-screen')) {
    location.reload(); // simplest: reload — session is set, will skip login
    return;
  }
  // Show/hide the privacy toggle based on role
  const privBtn = document.getElementById('privacy-btn');
  if (privBtn) privBtn.style.display = currentRole === 'admin' ? '' : 'none';
  // Show logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.style.display = '';
    logoutBtn.textContent = `↩ ${currentRole === 'admin' ? 'Admin' : 'Guest'}`;
  }
  loadData();
}

async function loadData() {
  try {
    const resp = await fetch(CSV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    allProfiles = parseCSV(text);

    const brides = allProfiles.filter(p => p['Filling the Form Of'] === 'Bride').length;
    const grooms = allProfiles.filter(p => p['Filling the Form Of'] === 'Groom').length;
    document.getElementById('bride-count').textContent = brides;
    document.getElementById('groom-count').textContent = grooms;
    document.getElementById('last-updated').textContent = 'Live Data';

    populateFilters();
    filtered = allProfiles.filter(p => p['Name'] && p['Name'].trim()).sort((a,b) => new Date(b['Timestamp']) - new Date(a['Timestamp']));
    allProfiles = allProfiles.filter(p => p['Name'] && p['Name'].trim());
    renderGrid();
  } catch(e) {
    document.getElementById('grid').innerHTML = `
      <div class="loading-state" style="grid-column:1/-1">
        <div style="font-size:36px;margin-bottom:12px">⚠</div>
        <div style="color:var(--rose)">Could not load profiles</div>
        <div style="font-size:12px;margin-top:8px;color:var(--text-dim)">
          Error: ${e.message}
        </div>
      </div>`;
  }
}

// ── Startup ───────────────────────────────────────────────────────────

(function startup() {
  const savedRole = sessionStorage.getItem('km_role');
  if (savedRole && Object.values(PASSWORDS).includes(savedRole)) {
    currentRole = savedRole;
    initApp();
  } else {
    showLoginScreen();
  }
})();

// ── Event listeners ───────────────────────────────────────────────────

document.getElementById('caste-filter').addEventListener('change', applyFilters);
document.getElementById('location-filter').addEventListener('change', applyFilters);
document.getElementById('sort-select').addEventListener('change', applyFilters);

document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    applyFilters();
  });
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDownloadManager(); } });

// ── Access control ────────────────────────────────────────────────────

// Returns display value for a field — masked if guest + field is in HIDDEN_FOR_GUEST
function fieldValue(key, val) {
  if (!val) return '—';
  if (currentRole === 'admin') return val;
  if (HIDDEN_FOR_GUEST.includes(key)) {
    const fn = MASK_FN[key];
    return fn ? fn(val) : '••••••';
  }
  return val;
}

function maskPhone(val)   { return fieldValue('Phone Number', val); }
function maskAddress(val) { return fieldValue('Address', val); }

// ── Login screen ──────────────────────────────────────────────────────

function showLoginScreen() {
  document.body.innerHTML = `
    <div id="login-screen" style="
      min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#f7f4ef;font-family:'DM Sans',sans-serif;">
      <div style="
        background:#fff;border:1px solid #d6cfc4;border-radius:20px;
        padding:40px 36px;width:100%;max-width:380px;text-align:center;
        box-shadow:0 12px 48px rgba(26,18,8,0.1);">
        <div style="font-family:'Cormorant Garamond',serif;font-size:30px;color:#8b5e1a;margin-bottom:4px">
          Kathyayini Matrimony
        </div>
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7a6a54;margin-bottom:32px">
          Admin Portal
        </div>
        <input
          type="password"
          id="login-input"
          placeholder="Enter password"
          onkeydown="if(event.key==='Enter')doLogin()"
          style="width:100%;padding:12px 16px;border:1px solid #d6cfc4;border-radius:10px;
            font-family:'DM Sans',sans-serif;font-size:14px;color:#1a1208;
            background:#f7f4ef;outline:none;margin-bottom:10px;box-sizing:border-box;"
          onfocus="this.style.borderColor='#c49a50'"
          onblur="this.style.borderColor='#d6cfc4'"
        >
        <div id="login-error" style="font-size:12px;color:#9e3040;min-height:18px;margin-bottom:10px"></div>
        <button onclick="doLogin()" style="
          width:100%;background:#8b5e1a;color:#fff8ef;border:none;border-radius:10px;
          padding:12px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;
          cursor:pointer;">
          Enter
        </button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('login-input')?.focus(), 50);
}

function doLogin() {
  const pw   = document.getElementById('login-input')?.value?.trim();
  const role = PASSWORDS[pw];
  if (role) {
    currentRole = role;
    sessionStorage.setItem('km_role', role);
    initApp();
  } else {
    const err = document.getElementById('login-error');
    if (err) err.textContent = 'Incorrect password. Please try again.';
    const inp = document.getElementById('login-input');
    if (inp) { inp.value = ''; inp.focus(); }
  }
}

function logout() {
  sessionStorage.removeItem('km_role');
  currentRole = null;
  location.reload();
}

// ── Privacy toggle (admin can preview guest view) ─────────────────────

let _previewGuest = false;

function togglePrivacy() {
  if (currentRole !== 'admin') return; // guests can't toggle
  _previewGuest = !_previewGuest;
  const btn = document.getElementById('privacy-btn');
  if (btn) {
    btn.textContent = _previewGuest ? '🔒 Guest View' : '👁 Hide Details';
    btn.classList.toggle('privacy-active', _previewGuest);
  }
  renderGrid();
}

// Override fieldValue to respect preview mode
const _origFieldValue = fieldValue;
function fieldValue(key, val) {
  if (!val) return '—';
  const effectiveRole = (_previewGuest && currentRole === 'admin') ? 'guest' : currentRole;
  if (effectiveRole === 'admin') return val;
  if (HIDDEN_FOR_GUEST.includes(key)) {
    const fn = MASK_FN[key];
    return fn ? fn(val) : '••••••';
  }
  return val;
}

// ── Lightbox ──────────────────────────────────────────────────────────

// Inject the lightbox DOM once on page load
(function createLightboxDOM() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="lightbox-overlay" id="lightbox-overlay" onclick="closeLightboxOnBg(event)">
      <button class="lightbox-close" onclick="closeLightbox()">✕</button>
      <button class="lightbox-arrow prev" id="lb-prev" onclick="lbPrev()">‹</button>
      <img class="lightbox-img" id="lightbox-img" alt="Full size photo">
      <button class="lightbox-arrow next" id="lb-next" onclick="lbNext()">›</button>
      <div class="lightbox-caption" id="lightbox-caption"></div>
    </div>`;
  document.body.appendChild(el.firstElementChild);
})();

// All images in the current card's slider — for prev/next navigation
let _lbImages = [];
let _lbIndex  = 0;

function openLightbox(imgEl) {
  // Collect sibling slides in the same slider
  const slider = imgEl.closest('.image-slider');
  const imgs = slider ? [...slider.querySelectorAll('.image-slide img')] : [imgEl];

  _lbImages = imgs.map(i => i.src).filter(Boolean);
  _lbIndex  = imgs.indexOf(imgEl);
  if (_lbIndex < 0) _lbIndex = 0;

  _lbShow();
  document.getElementById('lightbox-overlay').classList.add('open');
  document.addEventListener('keydown', _lbKeyHandler);
}

function _lbShow() {
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  img.style.opacity = '0';
  img.src = _lbImages[_lbIndex];
  img.onload = () => { img.style.opacity = '1'; };

  // Show arrows only if there are multiple images
  document.getElementById('lb-prev').style.display = _lbImages.length > 1 ? 'flex' : 'none';
  document.getElementById('lb-next').style.display = _lbImages.length > 1 ? 'flex' : 'none';
  cap.textContent = _lbImages.length > 1 ? `${_lbIndex + 1} / ${_lbImages.length}` : '';
}

function lbPrev() {
  _lbIndex = (_lbIndex - 1 + _lbImages.length) % _lbImages.length;
  _lbShow();
}

function lbNext() {
  _lbIndex = (_lbIndex + 1) % _lbImages.length;
  _lbShow();
}

function closeLightbox() {
  document.getElementById('lightbox-overlay').classList.remove('open');
  document.removeEventListener('keydown', _lbKeyHandler);
}

function closeLightboxOnBg(e) {
  if (e.target === document.getElementById('lightbox-overlay')) closeLightbox();
}

function _lbKeyHandler(e) {
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowRight')  lbNext();
  if (e.key === 'ArrowLeft')   lbPrev();
}
