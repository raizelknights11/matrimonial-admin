// =====================================================================
// CONFIG — edit this block to manage access
// =====================================================================

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjd0qi4vnm8rLuYE-J01S4Lgki9zy_CXcO16kZqc2G9n2OLBx0fOITQUSY1hGUiNol-eL5tDrrLGPj/pub?gid=212796903&single=true&output=csv';

// ── Access levels ─────────────────────────────────────────────────────
// 'admin' → sees everything including phone, address, email
// 'guest' → HIDDEN_FOR_GUEST fields are masked
const PASSWORDS = {
  'Kamala1970': 'admin',
  'Guest1970':  'guest',
};

// ── Fields hidden from guest access (filtered out entirely) ──────────
const HIDDEN_FOR_GUEST = [
  'Phone Number',
  'Address',
  'Email Address',
  "Father's Phone Number",
  "Mother's Phone Number",
  'Parents Phone Number',
];

// =====================================================================

let allProfiles  = [];
let filtered     = [];
let activeFilter = 'all';
let currentRole  = null;  // null = not logged in | 'admin' | 'guest'
let _previewGuest = false;

// =====================================================================
// IMAGE & HOROSCOPE — Drive-only, no local probing
// =====================================================================

// Extract a Google Drive file ID from any Drive URL format
function driveFileId(url) {
  if (!url) return null;
  const m1 = url.match(/\/d\/([^\/\?&]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return m2[1];
  return null;
}

// Thumbnail URL — used for displaying photos in cards/lightbox
function driveThumbUrl(url, size = 'w600') {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=${size}` : null;
}

// Direct download URL — used for opening horoscopes
function driveDirectUrl(url) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/view` : null;
}

// ── Horoscope cache — never re-fetches the same UID ──────────────────
// Stores: null (not checked) | false (no horoscope) | string URL
const _horoCache = {};

function getHoroscopeUrl(p) {
  // Horoscope is a Drive URL stored directly in the CSV column
  return driveDirectUrl(p['Horoscope'] || '') || null;
}

function buildImg(driveUrl, symbol) {
  const thumb = driveThumbUrl(driveUrl);
  if (!thumb) {
    return `<div class="img-placeholder">${symbol}</div>`;
  }
  return `<img
    src="${thumb}"
    onerror="this.parentElement.innerHTML='<div class=\\'img-placeholder\\'>${symbol}</div>'"
    onload="this.closest('.image-slide').classList.remove('img-loading')"
    onclick="openLightbox(this)"
    style="width:100%;height:100%;object-fit:contain;display:block;cursor:zoom-in;"
    alt="Profile photo"
  >`;
}

// =====================================================================
// CSV PARSER
// =====================================================================

function parseCSV(text) {
  const lines   = text.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows    = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseCSVLine(line);
    const obj  = {};
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
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// =====================================================================
// UTILITIES
// =====================================================================

// Returns a Date from a DOB string, or null.
// Handles: "1998", "15/08/1998", "1998-08-15", "08/15/1998",
// "15 Aug 1998", "August 15, 1998", "15-Aug-1998", etc.
function parseDOB(dob) {
  if (!dob) return null;
  const t = dob.trim();

  if (/^\d{4}$/.test(t)) return new Date(parseInt(t), 0, 1);

  // Contains a textual month name — let Date parse it directly
  // (handles "15 Aug 1998", "August 15, 1998", "15-Aug-1998", "Aug 15 1998")
  if (/[A-Za-z]{3,}/.test(t)) {
    const d = new Date(t.replace(/-/g, ' '));
    return isNaN(d) ? null : d;
  }

  const parts = t.split(/[\/\-\s]/);
  let d;
  if (parts.length === 3) {
    const n = parts.map(Number);
    if      (n[2] > 1900) d = new Date(n[2], n[0] - 1, n[1]);
    else if (n[0] > 1900) d = new Date(n[0], n[1] - 1, n[2]);
    else                  d = new Date(n[2], n[1] - 1, n[0]);
  } else { d = new Date(t); }
  return isNaN(d) ? null : d;
}

function getAge(dob) {
  const d = parseDOB(dob);
  if (!d) return '—';
  const age = Math.floor((Date.now() - d) / (365.25 * 24 * 60 * 60 * 1000));
  return age > 0 && age < 120 ? age + ' yrs' : '—';
}

// Always display DOB as DD/MM/YYYY, converting textual months ("15 Aug 1998") too
function formatDOB(dob) {
  const d = parseDOB(dob);
  if (!d) return dob || '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// =====================================================================
// CARD RENDERER
// =====================================================================

// Card DOM nodes are cached by UID so re-sorting never rebuilds them
const _cardCache = {};

function getOrCreateCard(p) {
  const uid = p['Unique ID'].trim();
  if (_cardCache[uid]) return _cardCache[uid];

  const isBride = p['Filling the Form Of'] === 'Bride';
  const type    = isBride ? 'bride' : 'groom';
  const cardId  = 'card-' + uid.replace(/[^a-z0-9]/gi, '');
  const age     = getAge(p['Date Of Birth']);
  const symbol  = isBride ? '♀' : '♂';

  const effRole    = (_previewGuest && currentRole === 'admin') ? 'guest' : currentRole;
  // Guests simply don't see the contact section — no notice, no clutter
  const contactHtml = effRole === 'admin'
    ? `<div class="detail-section">
        <div class="section-label">Contact</div>
        <div class="detail-grid">
          <div class="detail-item"><div class="detail-key">Phone</div><div class="detail-val">${p['Phone Number'] || '—'}</div></div>
          <div class="detail-item"><div class="detail-key">Email</div><div class="detail-val" style="word-break:break-all">${p['Email Address'] || '—'}</div></div>
          <div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Address</div><div class="detail-val">${p['Address'] || '—'}</div></div>
        </div>
      </div>`
    : '';

  // Horoscope opens in lightbox — no new tab
  const horoUrl = getHoroscopeUrl(p);
  const horoHtml = horoUrl
    ? `<button class="horoscope-btn" onclick="openHoroscopeLightbox('${horoUrl}','${uid}')">✦ View Horoscope</button>`
    : `<button class="horoscope-btn" style="opacity:0.4;cursor:not-allowed" disabled>✦ No Horoscope</button>`;

  const el = document.createElement('div');
  el.className = `profile-card ${type}`;
  el.id = cardId;
  el.innerHTML = `
    <div class="card-images">
      <div class="image-slider" id="${cardId}-slider">
        <div class="image-slide active img-loading" data-idx="0">
          ${buildImg(p['Photo 1 - of Bride or Groom'], symbol)}
        </div>
        <div class="image-slide img-loading" data-idx="1">
          ${buildImg(p['Photo 2 - of Bride or Groom'], symbol)}
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
          <div class="uid-row">
            <button class="uid-copy-btn" onclick="copyUID('${uid}',this)" title="Copy ID">
              <span class="uid-text">${uid}</span><span class="uid-copy-icon">⧉</span>
            </button>
          </div>
        </div>
        <div class="tag-row">
          <span class="tag ${type}">${p['Filling the Form Of']}</span>
          ${age !== '—' ? `<span class="tag neutral">${age}</span>` : ''}
          ${p['Height (in feet) - example 5 / 5`2 / 5`11'] ? `<span class="tag neutral">${p['Height (in feet) - example 5 / 5`2 / 5`11']}</span>` : ''}
          ${p['Rashi']     ? `<span class="tag neutral">${p['Rashi']}</span>`   : ''}
          ${p['Nakshatra'] ? `<span class="tag green">${p['Nakshatra']}</span>` : ''}
        </div>
      </div>

      <div class="card-scroll">
        <div class="detail-section">
          <div class="section-label">Personal</div>
          <div class="detail-grid">
            <div class="detail-item"><div class="detail-key">DOB</div><div class="detail-val">${formatDOB(p['Date Of Birth'])}</div></div>
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
            <div class="detail-item"><div class="detail-key">Same Gothra</div><div class="detail-val">${p['Will agree on Same Gothra'] || '—'}</div></div>
          </div>
        </div>
        <div class="divider"></div>
        ${contactHtml}
      </div>

      <div class="card-footer">
        ${horoHtml}
        <button class="contact-btn" onclick="openModal('${uid}')">⊞ Full Details</button>
      </div>
    </div>
  `;

  _cardCache[uid] = el;
  return el;
}

// =====================================================================
// SLIDE LOGIC
// =====================================================================

function goSlide(id, idx) {
  const slider = document.getElementById(id + '-slider');
  if (!slider) return;
  slider.querySelectorAll('.image-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
  slider.querySelectorAll('.img-dot').forEach((d, i)     => d.classList.toggle('active', i === idx));
  const cur = slider.querySelector(`.${id}-cur`);
  if (cur) cur.textContent = idx + 1;
}

function nextSlide(id) {
  const slider = document.getElementById(id + '-slider');
  if (!slider) return;
  const slides = slider.querySelectorAll('.image-slide');
  const cur    = Array.from(slides).findIndex(s => s.classList.contains('active'));
  goSlide(id, (cur + 1) % slides.length);
}

function prevSlide(id) {
  const slider = document.getElementById(id + '-slider');
  if (!slider) return;
  const slides = slider.querySelectorAll('.image-slide');
  const cur    = Array.from(slides).findIndex(s => s.classList.contains('active'));
  goSlide(id, (cur - 1 + slides.length) % slides.length);
}

// =====================================================================
// PROFILE DETAIL MODAL
// =====================================================================

let _modalIndex = -1;  // current position within `filtered` for prev/next nav

async function openModal(uid) {
  const p = allProfiles.find(x => x['Unique ID'].trim() === uid);
  if (!p) return;

  _modalIndex = filtered.findIndex(x => x['Unique ID'].trim() === uid);

  const isBride = p['Filling the Form Of'] === 'Bride';
  const type    = isBride ? 'bride' : 'groom';
  const symbol  = isBride ? '♀' : '♂';

  const skip = new Set([
    'Unique ID', 'Timestamp', 'Name', 'Filling the Form Of',
    'Photo 1 - of Bride or Groom', 'Photo 2 - of Bride or Groom', 'Horoscope',
    '* I Herby declare that the above particulars furnished is true and correct for the best of my knowledge and for the purpose of finding bride/ groom for self or family members only and will not use profiles for any commercial purposes including agent activities/ brokerage activities or sharing and forwarding to other groups or platforms. I Accept all terms and conditions of Kathyayini Matrimony Services',
  ]);

  const effectiveRole = (_previewGuest && currentRole === 'admin') ? 'guest' : currentRole;

  const detailRows = Object.entries(p)
    .filter(([k, v]) => {
      if (!v || !v.trim() || skip.has(k)) return false;
      if (effectiveRole !== 'admin' && HIDDEN_FOR_GUEST.includes(k)) return false;
      return true;
    })
    .map(([k, v]) => `
      <div class="md-row">
        <div class="md-key">${k.replace(/\s+/g, ' ').trim()}</div>
        <div class="md-val">${k === 'Date Of Birth' ? formatDOB(v) : v}</div>
      </div>`).join('');

  const photo1 = driveThumbUrl(p['Photo 1 - of Bride or Groom'], 'w600');
  const photo2 = driveThumbUrl(p['Photo 2 - of Bride or Groom'], 'w600');

  const horoUrl = getHoroscopeUrl(p);
  const horoBtn = horoUrl
    ? `<button class="horoscope-btn md-horo-btn" onclick="openHoroscopeLightbox('${horoUrl}','${uid}')">✦ View Horoscope</button>`
    : `<button class="horoscope-btn md-horo-btn" disabled style="opacity:0.4;cursor:not-allowed">✦ No Horoscope</button>`;

  document.getElementById('modal-body').innerHTML = `
    <div class="md-layout">
      <div class="md-banner">
        <div class="md-banner-left">
          <span class="md-banner-name">${p['Name'] || '—'}</span>
          <span class="md-banner-tag ${type}">${p['Filling the Form Of']}</span>
        </div>
        <div class="md-banner-right">
          <button class="uid-copy-btn" onclick="copyUID('${uid}',this)" title="Copy ID">
            <span class="uid-text">${uid}</span><span class="uid-copy-icon">⧉</span>
          </button>
          <span class="md-banner-reg">Registered ${(p['Timestamp'] || '').split(' ')[0]}</span>
        </div>
      </div>
      <div class="md-main">
        <div class="md-left" id="md-photos"></div>
        <div class="md-resize-handle" id="md-resize-handle" title="Drag to resize"></div>
        <div class="md-right">
          <div class="md-grid">${detailRows}</div>
          <div class="md-horo-row">${horoBtn}</div>
        </div>
      </div>
    </div>`;

  // Inject photos as real DOM nodes — avoids all URL/quote escaping issues with Drive URLs
  const photoContainer = document.getElementById('md-photos');
  [photo1, photo2].forEach(src => {
    if (!src) {
      const ph = document.createElement('div');
      ph.className = 'md-photo-placeholder';
      ph.textContent = symbol;
      photoContainer.appendChild(ph);
      return;
    }
    const img = document.createElement('img');
    img.className = 'md-photo';
    img.src = src;
    img.alt = 'Profile photo';
    img.addEventListener('error', function() {
      const ph = document.createElement('div');
      ph.className = 'md-photo-placeholder';
      ph.textContent = symbol;
      this.replaceWith(ph);
    });
    img.addEventListener('click', () => openLightboxFromSrc(src));
    photoContainer.appendChild(img);
  });

  // Resizable column divider — drag to adjust photo column width
  const resizeHandle = document.getElementById('md-resize-handle');
  const leftCol = document.getElementById('md-photos');
  const mainRow = leftCol.closest('.md-main');

  resizeHandle.addEventListener('mousedown', startResize);
  resizeHandle.addEventListener('touchstart', startResize, { passive: false });

  function startResize(e) {
    e.preventDefault();
    document.body.classList.add('md-resizing');
    const move = ev => doResize(ev);
    const stop = () => {
      document.body.classList.remove('md-resizing');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', stop);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', stop);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', stop);
  }

  function doResize(ev) {
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const rect = mainRow.getBoundingClientRect();
    let newWidth = clientX - rect.left;
    const min = 120, max = rect.width - 200;
    newWidth = Math.max(min, Math.min(max, newWidth));
    leftCol.style.width = newWidth + 'px';
  }

  // Update prev/next nav button states based on position in filtered list
  const prevBtn = document.getElementById('modal-prev-btn');
  const nextBtn = document.getElementById('modal-next-btn');
  prevBtn.style.visibility = _modalIndex > 0 ? 'visible' : 'hidden';
  nextBtn.style.visibility = (_modalIndex >= 0 && _modalIndex < filtered.length - 1) ? 'visible' : 'hidden';

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function navigateModal(dir) {
  const newIndex = _modalIndex + dir;
  if (newIndex < 0 || newIndex >= filtered.length) return;
  const next = filtered[newIndex];
  openModal(next['Unique ID'].trim());
}

document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// =====================================================================
// SEARCH & FILTERS
// =====================================================================

function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('search-clear').classList.remove('visible');
  applyFilters();
  input.focus();
}

document.getElementById('search-input').addEventListener('input', function() {
  document.getElementById('search-clear').classList.toggle('visible', this.value.length > 0);
  applyFilters();
});

document.getElementById('caste-filter').addEventListener('change', applyFilters);
document.getElementById('location-filter').addEventListener('change', applyFilters);
document.getElementById('sort-select').addEventListener('change', applyFilters);

document.querySelectorAll('.count-pill[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.count-pill[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    applyFilters();
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeLightbox(); closeHoroscopeLightbox(); }

  // Arrow-key navigation between profiles — only when the detail modal is
  // open and no photo/horoscope lightbox is on top of it
  const modalOpen = document.getElementById('modal-overlay').classList.contains('open');
  const lbOpen    = document.getElementById('lightbox-overlay').classList.contains('open');
  const horoOpen  = document.getElementById('horo-lightbox').classList.contains('open');
  if (modalOpen && !lbOpen && !horoOpen) {
    if (e.key === 'ArrowRight') navigateModal(1);
    if (e.key === 'ArrowLeft')  navigateModal(-1);
  }
});

function resetFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.remove('visible');
  document.getElementById('caste-filter').value = '';
  document.getElementById('location-filter').value = '';
  document.getElementById('sort-select').value = 'dob_desc';

  document.querySelectorAll('.count-pill[data-filter]').forEach(b => b.classList.remove('active'));
  document.getElementById('pill-all').classList.add('active');
  activeFilter = 'all';

  applyFilters();
}

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
      const s = [
        p['Name'], p['Gothra'], p['Nakshatra'], p['Sub Caste'],
        p['Work Field'], p['Currently Working-In(Company Name) and As(Position)'],
        p['Rashi'], p['Education '], p['ಮಠ - Mata'], p['Place of Birth'],
      ].join(' ').toLowerCase();
      if (!s.includes(search)) return false;
    }
    return true;
  });

  if      (sort === 'newest')   filtered.sort((a, b) => new Date(b['Timestamp']) - new Date(a['Timestamp']));
  else if (sort === 'oldest')   filtered.sort((a, b) => new Date(a['Timestamp']) - new Date(b['Timestamp']));
  else if (sort === 'name')     filtered.sort((a, b) => (a['Name'] || '').localeCompare(b['Name'] || ''));
  else if (sort === 'dob_asc')  filtered.sort((a, b) => (parseDOB(a['Date Of Birth']) || 0) - (parseDOB(b['Date Of Birth']) || 0));
  else if (sort === 'dob_desc') filtered.sort((a, b) => (parseDOB(b['Date Of Birth']) || 0) - (parseDOB(a['Date Of Birth']) || 0));

  renderGrid();
}

// =====================================================================
// GRID RENDER — reorders existing DOM nodes, never rebuilds them
// =====================================================================

function renderGrid() {
  const grid = document.getElementById('grid');
  document.getElementById('results-count').textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><div>No profiles match your filters</div></div>`;
    return;
  }

  // Append/reorder cached card nodes — images are already loaded, no flicker
  const fragment = document.createDocumentFragment();
  filtered.forEach(p => fragment.appendChild(getOrCreateCard(p)));
  grid.innerHTML = '';
  grid.appendChild(fragment);
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
// DATA LOADING
// =====================================================================

async function loadData() {
  try {
    const resp = await fetch(CSV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    allProfiles = parseCSV(text).filter(p => p['Name'] && p['Name'].trim());

    const brides = allProfiles.filter(p => p['Filling the Form Of'] === 'Bride').length;
    const grooms = allProfiles.filter(p => p['Filling the Form Of'] === 'Groom').length;
    document.getElementById('bride-count').textContent = brides;
    document.getElementById('groom-count').textContent = grooms;
    const allCountEl = document.getElementById('all-count');
    if (allCountEl) allCountEl.textContent = allProfiles.length;

    populateFilters();
    filtered = [...allProfiles].sort((a, b) => (parseDOB(b['Date Of Birth']) || 0) - (parseDOB(a['Date Of Birth']) || 0));
    renderGrid();
  } catch (e) {
    document.getElementById('grid').innerHTML = `
      <div class="loading-state" style="grid-column:1/-1">
        <div style="font-size:36px;margin-bottom:12px">⚠</div>
        <div style="color:var(--rose)">Could not load profiles</div>
        <div style="font-size:12px;margin-top:8px;color:var(--text-dim)">Error: ${e.message}</div>
      </div>`;
  }
}

// =====================================================================
// APP INIT & LOGIN
// =====================================================================

function initApp() {
  if (document.getElementById('login-screen')) {
    location.reload();
    return;
  }
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.style.display = '';
    logoutBtn.innerHTML = `
      <span class="logout-role">${currentRole === 'admin' ? '🔑 Admin' : '👤 Guest'}</span>
      <span class="logout-sep">·</span>
      <span class="logout-action">Sign Out</span>`;
  }
  loadData();
}

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

function togglePrivacy() {
  if (currentRole !== 'admin') return;
  _previewGuest = !_previewGuest;
  const btn = document.getElementById('privacy-btn');
  if (btn) {
    btn.textContent = _previewGuest ? '🔒 Guest View' : '👁 Hide Details';
    btn.classList.toggle('privacy-active', _previewGuest);
  }
  // Clear card cache so cards rebuild with correct contact visibility
  Object.keys(_cardCache).forEach(k => delete _cardCache[k]);
  renderGrid();
}

// =====================================================================
// COPY UID
// =====================================================================

function copyUID(uid, btn) {
  navigator.clipboard.writeText(uid).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('uid-copy-ok');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('uid-copy-ok'); }, 1500);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = uid;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✓';
    btn.classList.add('uid-copy-ok');
    setTimeout(() => { btn.textContent = '⧉'; btn.classList.remove('uid-copy-ok'); }, 1500);
  });
}

// =====================================================================
// LIGHTBOX — photos
// =====================================================================

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

let _lbImages = [];
let _lbIndex  = 0;

function openLightbox(imgEl) {
  const slider = imgEl.closest('.image-slider');
  const slides = slider ? [...slider.querySelectorAll('.image-slide')] : [];

  // Use higher-res thumbnail for lightbox
  _lbImages = slides
    .map(s => s.querySelector('img'))
    .filter(Boolean)
    .map(i => i.src.replace('sz=w600', 'sz=w1200'))
    .filter(Boolean);

  const activeSlide = slider ? slider.querySelector('.image-slide.active') : null;
  _lbIndex = activeSlide ? slides.indexOf(activeSlide) : 0;
  if (_lbIndex < 0) _lbIndex = 0;
  if (!_lbImages.length) { _lbImages = [imgEl.src]; _lbIndex = 0; }

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
  document.getElementById('lb-prev').style.display = _lbImages.length > 1 ? 'flex' : 'none';
  document.getElementById('lb-next').style.display = _lbImages.length > 1 ? 'flex' : 'none';
  cap.textContent = _lbImages.length > 1 ? `${_lbIndex + 1} / ${_lbImages.length}` : '';
}

function lbPrev() { _lbIndex = (_lbIndex - 1 + _lbImages.length) % _lbImages.length; _lbShow(); }
function lbNext() { _lbIndex = (_lbIndex + 1) % _lbImages.length; _lbShow(); }

function openLightboxFromSrc(src) {
  _lbImages = [src.replace('sz=w600', 'sz=w1200')];
  _lbIndex  = 0;
  _lbShow();
  document.getElementById('lightbox-overlay').classList.add('open');
  document.addEventListener('keydown', _lbKeyHandler);
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (overlay) overlay.classList.remove('open');
  document.removeEventListener('keydown', _lbKeyHandler);
}

function closeLightboxOnBg(e) {
  if (e.target === document.getElementById('lightbox-overlay')) closeLightbox();
}

function _lbKeyHandler(e) {
  if (e.key === 'Escape')     { closeLightbox(); closeHoroscopeLightbox(); }
  if (e.key === 'ArrowRight') lbNext();
  if (e.key === 'ArrowLeft')  lbPrev();
}

// =====================================================================
// HOROSCOPE LIGHTBOX — iframe viewer, works for PDF/image/any Drive file
// =====================================================================

(function createHoroLightboxDOM() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="lightbox-overlay horo-lightbox" id="horo-lightbox" onclick="closeHoroOnBg(event)">
      <div class="horo-lightbox-inner" id="horo-lightbox-inner">
        <div class="horo-lightbox-header">
          <span class="horo-lightbox-title" id="horo-title">Horoscope</span>
          <button class="lightbox-close" style="position:static;margin-left:auto" onclick="closeHoroscopeLightbox()">✕</button>
        </div>
        <iframe id="horo-frame" class="horo-frame" src="" allowfullscreen></iframe>
        <div class="horo-lightbox-footer">
          <span style="font-size:11px;color:rgba(255,255,255,0.35)">
            If the file doesn't load, your browser may be blocking Drive embeds.
          </span>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el.firstElementChild);
})();

function openHoroscopeLightbox(driveViewUrl, uid) {
  const id = driveFileId(driveViewUrl);
  const embedUrl = id
    ? `https://drive.google.com/file/d/${id}/preview`
    : driveViewUrl;

  document.getElementById('horo-frame').src = embedUrl;
  document.getElementById('horo-title').textContent = uid ? `Horoscope — ${uid}` : 'Horoscope';
  document.getElementById('horo-lightbox').classList.add('open');
}

function closeHoroscopeLightbox() {
  const el = document.getElementById('horo-lightbox');
  if (el) {
    el.classList.remove('open');
    document.getElementById('horo-frame').src = '';
  }
}

function closeHoroOnBg(e) {
  if (e.target === document.getElementById('horo-lightbox')) closeHoroscopeLightbox();
}

// =====================================================================
// STARTUP
// =====================================================================

(function startup() {
  const savedRole = sessionStorage.getItem('km_role');
  if (savedRole && Object.values(PASSWORDS).includes(savedRole)) {
    currentRole = savedRole;
    initApp();
  } else {
    showLoginScreen();
  }
})();
