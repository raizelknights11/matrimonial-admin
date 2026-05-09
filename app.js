// =====================================================================
// CONFIG
// Each profile's files live in:  ./profiles/<UniqueID>/
//   photo1.jpg   — first photo  (can be .jpg / .jpeg / .png / .webp)
//   photo2.jpg   — second photo (same)
//   horoscope.*  — any extension (.pdf / .jpg / .png etc.)
//
// CSV lives at: ./data/profiles.csv
// =====================================================================

const CSV_URL = './data/profiles.csv';

// Supported image extensions to try for photos
const IMG_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

// Supported horoscope extensions to try
const HORO_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

let allProfiles = [];
let filtered = [];
let activeFilter = 'all';

// =====================================================================
// FILE PATH HELPERS
// =====================================================================

// Build base folder path for a profile
function profileFolder(uid) {
  return `./profiles/${uid.trim()}`;
}

// Return an array of candidate photo URLs for a given slot (1 or 2)
function photoCandidates(uid, slot) {
  const base = profileFolder(uid);
  return IMG_EXTENSIONS.map(ext => `${base}/photo${slot}.${ext}`);
}

// Return an array of candidate horoscope URLs
function horoscopeCandidates(uid) {
  const base = profileFolder(uid);
  return HORO_EXTENSIONS.map(ext => `${base}/horoscope.${ext}`);
}

// Try loading a list of URLs one by one; resolve with the first that loads
function firstValidImage(candidates) {
  return new Promise(resolve => {
    let idx = 0;
    function tryNext() {
      if (idx >= candidates.length) { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve(candidates[idx]);
      img.onerror = () => { idx++; tryNext(); };
      img.src = candidates[idx];
    }
    tryNext();
  });
}

// Check if a URL exists (HEAD request); resolve true/false
async function urlExists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

// Find the first existing horoscope file for a profile
async function findHoroscope(uid) {
  const candidates = horoscopeCandidates(uid);
  for (const url of candidates) {
    if (await urlExists(url)) return url;
  }
  return null;
}

// =====================================================================
// CSV PARSER
// =====================================================================

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
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// =====================================================================
// UTILITIES
// =====================================================================

function getAge(dob) {
  if (!dob) return '—';
  const parts = dob.split(/[\/\-\s]/);
  let d;
  if (parts.length === 3) {
    const nums = parts.map(Number);
    if (nums[2] > 1900) d = new Date(nums[2], nums[0] - 1, nums[1]);
    else if (nums[0] > 1900) d = new Date(nums[0], nums[1] - 1, nums[2]);
    else d = new Date(nums[2], nums[1] - 1, nums[0]);
  } else {
    d = new Date(dob);
  }
  if (isNaN(d)) return '—';
  const age = Math.floor((Date.now() - d) / (365.25 * 24 * 60 * 60 * 1000));
  return age > 0 && age < 120 ? age + ' yrs' : '—';
}

// =====================================================================
// CARD RENDERER
// =====================================================================

function createCard(p) {
  const uid = p['Unique ID'].trim();
  const isBride = p['Filling the Form Of'] === 'Bride';
  const type = isBride ? 'bride' : 'groom';
  const cardId = 'card-' + uid.replace(/[^a-z0-9]/gi, '');
  const age = getAge(p['Date Of Birth']);
  const placeholder = `<div class="img-placeholder">${isBride ? '♀' : '♂'}</div>`;

  // Build two image slides using local paths; onerror falls back to placeholder
  // We try all extensions by chaining onerror handlers
  function imgTag(slot) {
    const candidates = photoCandidates(uid, slot);
    // Build a chain: try each extension via onerror
    const fallbackChain = candidates.map((src, i) => {
      if (i === candidates.length - 1) {
        // Last one — on error show placeholder
        return `src="${src}" onerror="this.parentElement.innerHTML='${placeholder.replace(/'/g, "\\'")}'"`; 
      }
      return `src="${candidates[0]}"`;
    })[0];

    // Simpler approach: use the first candidate and let onerror try the rest
    return buildImgWithFallback(candidates, placeholder);
  }

  return `
    <div class="profile-card ${type}" id="${cardId}">
      <div class="card-images">
        <div class="image-slider" id="${cardId}-slider">
          <div class="image-slide active" data-idx="0">
            ${buildImgWithFallback(photoCandidates(uid, 1), placeholder)}
          </div>
          <div class="image-slide" data-idx="1">
            ${buildImgWithFallback(photoCandidates(uid, 2), placeholder)}
          </div>
          <button class="img-arrow prev" onclick="prevSlide('${cardId}')">‹</button>
          <button class="img-arrow next" onclick="nextSlide('${cardId}')">›</button>
          <div class="img-count-badge"><span class="${cardId}-cur">1</span>/2</div>
          <div class="img-nav">
            <button class="img-dot active" onclick="goSlide('${cardId}',0)"></button>
            <button class="img-dot" onclick="goSlide('${cardId}',1)"></button>
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
            ${p['Rashi'] ? `<span class="tag neutral">${p['Rashi']}</span>` : ''}
            ${p['Nakshatra'] ? `<span class="tag green">${p['Nakshatra']}</span>` : ''}
          </div>
        </div>

        <div class="card-scroll">
          <div class="detail-section">
            <div class="section-label">Personal</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">DOB</div><div class="detail-val">${p['Date Of Birth'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Birth Place</div><div class="detail-val">${p['Place of Birth'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Gothra</div><div class="detail-val">${p['Gothra'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Sub-Caste</div><div class="detail-val">${p['Sub Caste'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Mata</div><div class="detail-val">${p['ಮಠ - Mata'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Charana</div><div class="detail-val">${p['Charana'] || '—'}</div></div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="detail-section">
            <div class="section-label">Professional</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">Education</div><div class="detail-val">${p['Education '] || p['Education'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Field</div><div class="detail-val">${p['Work Field'] || '—'}</div></div>
              <div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Company / Role</div><div class="detail-val">${p['Currently Working-In(Company Name) and As(Position)'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Salary</div><div class="detail-val">${p['Salary(LPA)'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Degree</div><div class="detail-val">${p['Mention your degrees '] || p['Mention your degrees'] || '—'}</div></div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="detail-section">
            <div class="section-label">Family</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">Father</div><div class="detail-val">${p["Father's Name"] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Occ.</div><div class="detail-val">${p['Occupation '] || p['Occupation'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Mother</div><div class="detail-val">${p["Mother's Name"] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Siblings</div><div class="detail-val">${p['Siblings'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Father's Native</div><div class="detail-val">${p["Father's Native"] || '—'}</div></div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="detail-section">
            <div class="section-label">Preferences</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">Currently In</div><div class="detail-val">${p['Staying In'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Relocation</div><div class="detail-val">${p['Planning To Relocate'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Age Gap</div><div class="detail-val">${p['Age Gap'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Abroad</div><div class="detail-val">${p['Abroad Relocation'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Language</div><div class="detail-val">${p['Language Preference '] || p['Language Preference'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Habits</div><div class="detail-val">${p['Personal Habits'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Same Gothra</div><div class="detail-val">${p['Will agree on Same Gothra'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Any Brahmin</div><div class="detail-val">${p['Will agree on any Bhramins and Mata'] || '—'}</div></div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="detail-section">
            <div class="section-label">Contact</div>
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-key">Phone</div><div class="detail-val">${p['Phone Number'] || '—'}</div></div>
              <div class="detail-item"><div class="detail-key">Email</div><div class="detail-val" style="word-break:break-all">${p['Email Address'] || '—'}</div></div>
              <div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Address</div><div class="detail-val">${p['Address'] || '—'}</div></div>
            </div>
          </div>
        </div>

        <div class="card-footer">
          <!-- Horoscope button: checked and injected after card renders -->
          <span id="${cardId}-horo">
            <button class="horoscope-btn" style="opacity:0.4;cursor:not-allowed" disabled>✦ No Horoscope</button>
          </span>
          <button class="contact-btn" onclick="openModal('${uid}')">⊞ Full Details</button>
        </div>
      </div>
    </div>
  `;
}

// Build an <img> tag that tries each candidate extension via chained onerror
function buildImgWithFallback(candidates, placeholder) {
  if (!candidates.length) return placeholder;
  // Build nested onerror chain as a data attribute approach
  // We'll store candidates on the img and use a global handler
  const id = 'img-' + Math.random().toString(36).slice(2, 8);
  const candidatesJson = JSON.stringify(candidates).replace(/"/g, '&quot;');
  return `<img
    id="${id}"
    src="${candidates[0]}"
    data-candidates="${candidatesJson}"
    data-idx="0"
    onerror="tryNextImg(this)"
    style="width:100%;height:100%;object-fit:cover;display:block"
    alt="Profile photo"
  >`;
}

// Called by onerror on each img — tries the next extension
function tryNextImg(img) {
  const candidates = JSON.parse(img.dataset.candidates.replace(/&quot;/g, '"'));
  let idx = parseInt(img.dataset.idx) + 1;
  if (idx < candidates.length) {
    img.dataset.idx = idx;
    img.src = candidates[idx];
  } else {
    // All extensions failed — show placeholder
    const isBride = img.closest('.profile-card')?.classList.contains('bride');
    img.parentElement.innerHTML = `<div class="img-placeholder">${isBride ? '♀' : '♂'}</div>`;
  }
}

// After rendering, check horoscope existence and update button
async function injectHoroscopeButtons() {
  for (const p of filtered) {
    const uid = p['Unique ID'].trim();
    const cardId = 'card-' + uid.replace(/[^a-z0-9]/gi, '');
    const slot = document.getElementById(`${cardId}-horo`);
    if (!slot) continue;

    const horoUrl = await findHoroscope(uid);
    if (horoUrl) {
      slot.innerHTML = `<a class="horoscope-btn" href="${horoUrl}" target="_blank">✦ View Horoscope</a>`;
    }
  }
}

// =====================================================================
// SLIDE LOGIC
// =====================================================================

function goSlide(id, idx) {
  const slider = document.getElementById(id + '-slider');
  if (!slider) return;
  slider.querySelectorAll('.image-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
  slider.querySelectorAll('.img-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
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

// =====================================================================
// MODAL
// =====================================================================

async function openModal(uid) {
  const p = allProfiles.find(x => x['Unique ID'].trim() === uid);
  if (!p) return;

  document.getElementById('modal-name').textContent = p['Name'] || '—';
  document.getElementById('modal-id').textContent =
    uid + ' · ' + (p['Filling the Form Of']) + ' · Registered ' + (p['Timestamp'] || '').split(' ')[0];

  const skip = new Set([
    'Photo 1 - of Bride or Groom', 'Photo 2 - of Bride or Groom', 'Horoscope',
    '* I Herby declare that the above particulars furnished is true and correct for the best of my knowledge and for the purpose of finding bride/ groom for self or family members only and will not use profiles for any commercial purposes including agent activities/ brokerage activities or sharing and forwarding to other groups or platforms. I Accept all terms and conditions of Kathyayini Matrimony Services'
  ]);

  const rows = Object.entries(p)
    .filter(([k, v]) => v && v.trim() && !skip.has(k))
    .map(([k, v]) => `
      <div class="modal-detail-row">
        <div class="modal-key">${k.replace(/\s+/g, ' ').trim()}</div>
        <div class="modal-val">${v}</div>
      </div>
    `).join('');

  const horoUrl = await findHoroscope(uid);
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

document.getElementById('modal-overlay').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// =====================================================================
// FILTER & SEARCH
// =====================================================================

function applyFilters() {
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  const caste = document.getElementById('caste-filter').value;
  const location = document.getElementById('location-filter').value;
  const sort = document.getElementById('sort-select').value;

  filtered = allProfiles.filter(p => {
    if (activeFilter !== 'all' && p['Filling the Form Of'] !== activeFilter) return false;
    if (caste && p['Sub Caste'] !== caste) return false;
    if (location) {
      const loc = p['Staying In'] || '';
      const city = p['If currently not staying in Bengaluru Please mention the city'] || '';
      if (!loc.toLowerCase().includes(location.toLowerCase()) &&
          !city.toLowerCase().includes(location.toLowerCase())) return false;
    }
    if (search) {
      const searchable = [
        p['Name'], p['Gothra'], p['Nakshatra'], p['Sub Caste'], p['Work Field'],
        p['Currently Working-In(Company Name) and As(Position)'], p['Rashi'],
        p['Education '], p['ಮಠ - Mata'], p['Place of Birth']
      ].join(' ').toLowerCase();
      if (!searchable.includes(search)) return false;
    }
    return true;
  });

  if (sort === 'newest') filtered.sort((a, b) => new Date(b['Timestamp']) - new Date(a['Timestamp']));
  else if (sort === 'oldest') filtered.sort((a, b) => new Date(a['Timestamp']) - new Date(b['Timestamp']));
  else if (sort === 'name') filtered.sort((a, b) => (a['Name'] || '').localeCompare(b['Name'] || ''));

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
  injectHoroscopeButtons(); // async — fills in horoscope buttons after render
}

function populateFilters() {
  const castes = [...new Set(allProfiles.map(p => p['Sub Caste']).filter(Boolean))].sort();
  const casteEl = document.getElementById('caste-filter');
  castes.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    casteEl.appendChild(o);
  });

  const locations = [...new Set(allProfiles.map(p => p['Staying In']).filter(Boolean))].sort();
  const locEl = document.getElementById('location-filter');
  locations.forEach(l => {
    const o = document.createElement('option');
    o.value = l; o.textContent = l;
    locEl.appendChild(o);
  });
}

// =====================================================================
// LOAD DATA
// =====================================================================

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
    filtered = [...allProfiles].sort((a, b) => new Date(b['Timestamp']) - new Date(a['Timestamp']));
    renderGrid();
  } catch (e) {
    document.getElementById('grid').innerHTML = `
      <div class="loading-state" style="grid-column:1/-1">
        <div style="font-size:36px;margin-bottom:12px">⚠</div>
        <div style="color:var(--rose)">Could not load profiles.csv</div>
        <div style="font-size:12px;margin-top:8px;color:var(--text-dim)">
          Make sure <strong>data/profiles.csv</strong> exists in the repo.<br>Error: ${e.message}
        </div>
      </div>`;
  }
}

// =====================================================================
// EVENT LISTENERS
// =====================================================================

document.getElementById('search-input').addEventListener('input', applyFilters);
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

loadData();
