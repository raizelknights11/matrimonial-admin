// =====================================================================
// CONFIG
// Each profile's files live in: ./profiles/<UniqueID>/
//   <UniqueID>-Photo-1.jpg    first photo  (.jpg/.jpeg/.png/.webp)
//   <UniqueID>-Photo-2.jpg    second photo (same)
//   <UniqueID>-horoscope.*    any extension (.pdf/.jpg/.png/.webp)
//
// If local files are missing, falls back to Google Drive URLs in CSV.
// CSV: ./data/profiles.csv
// =====================================================================

const CSV_URL = './data/profiles.csv';
const IMG_EXTENSIONS  = ['jpg', 'jpeg', 'png', 'webp'];
const HORO_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

let allProfiles  = [];
let filtered     = [];
let activeFilter = 'all';
let privacyMode  = false;  // hides phone & address when true

// ── File path helpers ────────────────────────────────────────────────

function profileFolder(uid) {
  return `./profiles/${uid.trim()}`;
}

// Local candidates: <UID>-Photo-1.jpg, <UID>-Photo-1.jpeg, etc.
function photoCandidates(uid, slot) {
  const base = profileFolder(uid);
  const u = uid.trim();
  return IMG_EXTENSIONS.map(ext => `${base}/${u}-Photo-${slot}.${ext}`);
}

// Local candidates: <UID>-horoscope.pdf, <UID>-horoscope.jpg, etc.
function horoscopeCandidates(uid) {
  const base = profileFolder(uid);
  const u = uid.trim();
  return HORO_EXTENSIONS.map(ext => `${base}/${u}-horoscope.${ext}`);
}

async function urlExists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

// Find horoscope: local first, then Drive URL from CSV as fallback
async function findHoroscope(uid, driveUrl) {
  for (const url of horoscopeCandidates(uid)) {
    if (await urlExists(url)) return url;
  }
  // Fallback: Google Drive
  const fallback = driveViewUrl(driveUrl);
  if (fallback) return fallback;
  return null;
}

// ── Image with local → Drive fallback ────────────────────────────────
// localCandidates: UID-prefixed local paths tried first
// driveUrl: raw CSV Google Drive URL used only if all local paths fail

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
    style="width:100%;height:100%;object-fit:cover;display:block"
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

// ── Privacy helpers ───────────────────────────────────────────────────

function maskPhone(val) {
  if (!val) return '—';
  return privacyMode ? val.replace(/\d(?=\d{4})/g, '•') : val;
}

function maskAddress(val) {
  if (!val) return '—';
  if (!privacyMode) return val;
  return val.trim().split(/[\s,]+/)[0] + ' …';
}

function togglePrivacy() {
  privacyMode = !privacyMode;
  const btn = document.getElementById('privacy-btn');
  if (btn) {
    btn.textContent = privacyMode ? '🔒 Details Hidden' : '👁 Hide Details';
    btn.classList.toggle('privacy-active', privacyMode);
  }
  renderGrid();
}

// ── Card renderer ─────────────────────────────────────────────────────

function createCard(p) {
  const uid    = p['Unique ID'].trim();
  const isBride = p['Filling the Form Of'] === 'Bride';
  const type   = isBride ? 'bride' : 'groom';
  const cardId = 'card-' + uid.replace(/[^a-z0-9]/gi, '');
  const age    = getAge(p['Date Of Birth']);
  const symbol = isBride ? '♀' : '♂';

  // Drive URLs from CSV — used only if local files are missing
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
              <div class="detail-item"><div class="detail-key">Phone</div><div class="detail-val">${maskPhone(p['Phone Number'])}</div></div>
              <div class="detail-item"><div class="detail-key">Email</div><div class="detail-val" style="word-break:break-all">${p['Email Address']||'—'}</div></div>
              <div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Address</div><div class="detail-val">${maskAddress(p['Address'])}</div></div>
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
    const url = await findHoroscope(uid, p['Horoscope'] || '');
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

  const sensitiveKeys = ['phone', 'address', 'mobile'];
  const isSensitive = k => sensitiveKeys.some(s => k.toLowerCase().includes(s));

  const rows = Object.entries(p)
    .filter(([k,v]) => v && v.trim() && !skip.has(k))
    .map(([k,v]) => {
      let display = v;
      if (privacyMode && isSensitive(k)) {
        display = k.toLowerCase().includes('address') ? maskAddress(v) : maskPhone(v);
      }
      return `
      <div class="modal-detail-row">
        <div class="modal-key">${k.replace(/\s+/g,' ').trim()}</div>
        <div class="modal-val">${display}</div>
      </div>`;
    }).join('');

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

    // Files named <UID>-Photo-1.jpg / <UID>-Photo-2.jpg / <UID>-horoscope.pdf
    // so unzipping at repo root creates: profiles/<UID>/<UID>-Photo-1.jpg
    const files = [
      { url: p['Photo 1 - of Bride or Groom'], name: `${uid}-Photo-1` },
      { url: p['Photo 2 - of Bride or Groom'], name: `${uid}-Photo-2` },
      { url: p['Horoscope'],                   name: `${uid}-horoscope` },
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
    document.getElementById('last-updated').textContent = 'Local Data';

    populateFilters();
    filtered = allProfiles.filter(p => p['Name'] && p['Name'].trim()).sort((a,b) => new Date(b['Timestamp']) - new Date(a['Timestamp']));
    allProfiles = allProfiles.filter(p => p['Name'] && p['Name'].trim());
    renderGrid();
  } catch(e) {
    document.getElementById('grid').innerHTML = `
      <div class="loading-state" style="grid-column:1/-1">
        <div style="font-size:36px;margin-bottom:12px">⚠</div>
        <div style="color:var(--rose)">Could not load data/profiles.csv</div>
        <div style="font-size:12px;margin-top:8px;color:var(--text-dim)">
          Make sure <strong>data/profiles.csv</strong> is in the repo.<br>Error: ${e.message}
        </div>
      </div>`;
  }
}

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

loadData();
