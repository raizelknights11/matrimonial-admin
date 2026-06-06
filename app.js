// =====================================================================
// CONFIG
// Each profile's files live in: ./profiles/<UniqueID>/
//   photo1.jpg      first photo  (.jpg/.jpeg/.png/.webp)
//   photo2.jpg      second photo (same)
//   horoscope.*     any extension (.pdf/.jpg/.png/.webp)
// CSV: ./data/profiles.csv
// =====================================================================

const CSV_URL = './data/profiles.csv';
const IMG_EXTENSIONS  = ['jpg', 'jpeg', 'png', 'webp'];
const HORO_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

let allProfiles = [];
let filtered    = [];
let activeFilter = 'all';

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

async function findHoroscope(uid, driveUrl) {
  for (const url of horoscopeCandidates(uid)) {
    if (await urlExists(url)) return url;
  }
  // Fallback: Drive URL from CSV
  if (driveUrl) {
    const dv = driveViewUrl(driveUrl);
    if (dv) return dv;
  }
  return null;
}

// ── Image with fallback extensions ───────────────────────────────────

function buildImgWithFallback(candidates, placeholderSymbol) {
  const candidatesAttr = candidates.join('|');
  return `<img
    src="${candidates[0]}"
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

// ── Card renderer ─────────────────────────────────────────────────────

function createCard(p) {
  const uid    = p['Unique ID'].trim();
  const isBride = p['Filling the Form Of'] === 'Bride';
  const type   = isBride ? 'bride' : 'groom';
  const cardId = 'card-' + uid.replace(/[^a-z0-9]/gi, '');
  const age    = getAge(p['Date Of Birth']);
  const symbol = isBride ? '♀' : '♂';

  return `
    <div class="profile-card ${type}" id="${cardId}">
      <div class="card-images">
        <div class="image-slider" id="${cardId}-slider">
          <div class="image-slide active" data-idx="0">
            ${buildImgWithFallback(photoCandidates(uid, 1), symbol)}
          </div>
          <div class="image-slide" data-idx="1">
            ${buildImgWithFallback(photoCandidates(uid, 2), symbol)}
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
          <button class="contact-btn" onclick="openModal('${uid}')">⊞ Details</button>
          <button class="pdf-btn" onclick="generateProfilePDF('${uid}')" title="Download profile as PDF">📄 PDF</button>
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
        <div class="modal-val">${v}</div>
      </div>`).join('');

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

document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ── PDF Generator ────────────────────────────────────────────────────
// Builds a styled HTML page and opens the browser print dialog.
// The user saves as PDF — filename suggested via <title>.
// Photos: local files first (same fallback chain as cards), then Drive.

async function generateProfilePDF(uid) {
  const p = allProfiles.find(x => x['Unique ID'].trim() === uid);
  if (!p) return;

  const isBride  = p['Filling the Form Of'] === 'Bride';
  const accentCol = isBride ? '#9e3040' : '#1f4f8a';
  const typeLabel = p['Filling the Form Of'] || '';
  const age       = getAge(p['Date Of Birth']);
  const filename  = uid + '-profile';

  // ── Resolve photo URLs (local first, Drive fallback) ─────────────────
  async function resolveImg(slot, driveUrl) {
    const localCandidates = photoCandidates(uid, slot);
    for (const url of localCandidates) {
      if (await urlExists(url)) return url;
    }
    const dv = driveViewUrl(driveUrl);
    return dv || null;
  }

  const photo1Url = await resolveImg(1, p['Photo 1 - of Bride or Groom'] || '');
  const photo2Url = await resolveImg(2, p['Photo 2 - of Bride or Groom'] || '');
  const horoUrl   = await findHoroscope(uid);

  // Convert image URL to base64 so it embeds properly in the print window
  async function toBase64(url) {
    if (!url) return null;
    try {
      const proxyUrl = url.includes('drive.google')
        ? 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
        : url;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return await new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  const [b64Photo1, b64Photo2] = await Promise.all([
    toBase64(photo1Url),
    toBase64(photo2Url),
  ]);

  // ── Build photo HTML ─────────────────────────────────────────────────
  const photoBlock = [b64Photo1, b64Photo2]
    .filter(Boolean)
    .map(src => `<img src="${src}" class="profile-photo">`)
    .join('');

  // ── Build detail rows ────────────────────────────────────────────────
  const SKIP = new Set([
    'Photo 1 - of Bride or Groom', 'Photo 2 - of Bride or Groom', 'Horoscope', 'Timestamp',
    '* I Herby declare that the above particulars furnished is true and correct for the best of my knowledge and for the purpose of finding bride/ groom for self or family members only and will not use profiles for any commercial purposes including agent activities/ brokerage activities or sharing and forwarding to other groups or platforms. I Accept all terms and conditions of Kathyayini Matrimony Services'
  ]);

  const SECTIONS = [
    { label: 'Personal', keys: [
      ['Date Of Birth','DOB'], ['Place of Birth','Birth Place'],
      ['Gothra','Gothra'], ['Sub Caste','Sub-Caste'],
      ['ಮಠ - Mata','Mata'], ['Charana','Charana'],
      ['Rashi','Rashi'], ['Nakshatra','Nakshatra'],
      ['Height (in feet) - example 5 / 5`2 / 5`11', 'Height'],
    ]},
    { label: 'Professional', keys: [
      ['Education ','Education'],['Education','Education'],
      ['Work Field','Field'],['Mention your degrees ','Degrees'],['Mention your degrees','Degrees'],
      ['Currently Working-In(Company Name) and As(Position)','Company / Role'],
      ['Salary(LPA)','Salary (LPA)'],
    ]},
    { label: 'Family', keys: [
      ['Father\'s Name','Father'],['Father\'s Occupation ','Father Occ.'],['Father\'s Occupation','Father Occ.'],
      ['Mother\'s Name','Mother'],['Siblings','Siblings'],['Father\'s Native','Father\'s Native'],
    ]},
    { label: 'Preferences', keys: [
      ['Staying In','Currently In'],['Planning To Relocate','Relocation'],
      ['Age Gap','Age Gap'],['Abroad Relocation ','Abroad'],['Abroad Relocation','Abroad'],
      ['Language Preference ','Language'],['Language Preference','Language'],
      ['Personal Habits','Habits'],['Will agree on Same Gothra','Same Gothra'],
      ['Will agree on any Bhramins and Mata','Any Brahmin'],
    ]},
    { label: 'Contact', keys: [
      ['Phone Number','Phone'],['Email Address','Email'],['Address','Address'],
    ]},
  ];

  const seen = new Set();
  function sectionRows(keys) {
    return keys.map(([csvKey, label]) => {
      const val = p[csvKey];
      if (!val || !val.trim() || seen.has(csvKey)) return '';
      seen.add(csvKey);
      return `<tr><td class="k">${label}</td><td class="v">${val}</td></tr>`;
    }).join('');
  }

  const sectionsHtml = SECTIONS.map(s => {
    const rows = sectionRows(s.keys);
    if (!rows) return '';
    return `
      <tr class="section-head"><td colspan="2">${s.label}</td></tr>
      ${rows}`;
  }).join('');

  // ── Horoscope note ────────────────────────────────────────────────────
  const horoNote = horoUrl
    ? `<p class="horo-note">Horoscope attached: <em>${uid}-horoscope</em></p>`
    : '';

  // ── Print window ──────────────────────────────────────────────────────
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1208; background: #fff; }

    /* ── Header ── */
    .pdf-header {
      display: flex; align-items: flex-start; gap: 20px;
      border-bottom: 2px solid ${accentCol}; padding-bottom: 14px; margin-bottom: 16px;
    }
    .photos { display: flex; gap: 10px; flex-shrink: 0; }
    .profile-photo {
      width: 110px; height: 140px; object-fit: contain;
      border: 1px solid #d6cfc4; border-radius: 6px; background: #f5f0ea;
    }
    .header-text { flex: 1; }
    .org-name {
      font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase;
      color: #8b5e1a; margin-bottom: 6px; font-weight: 600;
    }
    .profile-name {
      font-size: 24px; font-weight: 700; color: #1a1208;
      font-family: Georgia, serif; line-height: 1.2; margin-bottom: 6px;
    }
    .type-badge {
      display: inline-block; padding: 3px 12px; border-radius: 20px;
      font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;
      background: ${accentCol}18; color: ${accentCol}; border: 1px solid ${accentCol}50;
      margin-bottom: 8px;
    }
    .quick-facts { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 4px; }
    .qf { font-size: 11px; color: #4a3c2c; }
    .qf span { font-weight: 600; color: #1a1208; }
    .uid-badge {
      margin-top: 10px; font-size: 10px; color: #7a6a54;
      letter-spacing: 1px; font-family: monospace;
    }

    /* ── Details table ── */
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    tr { break-inside: avoid; }
    td { padding: 5px 8px; vertical-align: top; border-bottom: 1px solid #ede8e0; }
    td.k {
      width: 32%; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
      color: #7a6a54; font-weight: 500; padding-top: 6px;
    }
    td.v { font-size: 11px; color: #1a1208; line-height: 1.5; }
    tr.section-head td {
      background: ${accentCol}10; color: ${accentCol}; font-size: 9px;
      font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
      padding: 6px 8px 4px; border-bottom: 1px solid ${accentCol}30;
    }

    /* ── Footer ── */
    .pdf-footer {
      margin-top: 18px; padding-top: 10px; border-top: 1px solid #d6cfc4;
      font-size: 9px; color: #a89080; display: flex; justify-content: space-between;
    }
    .horo-note {
      margin-top: 12px; font-size: 10px; color: #4a3c2c;
      padding: 6px 10px; background: #fdf6e8; border: 1px solid #c49a50;
      border-radius: 4px; break-inside: avoid;
    }
  </style>
</head>
<body>

<div class="pdf-header">
  <div class="photos">${photoBlock || '<div style="width:110px;height:140px;border:1px solid #d6cfc4;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#c49a50;font-size:32px;background:#f5f0ea">${isBride ? '♀' : '♂'}</div>'}</div>
  <div class="header-text">
    <div class="org-name">Kathyayini Matrimony</div>
    <div class="profile-name">${p['Name'] || '—'}</div>
    <div class="type-badge">${typeLabel}</div>
    <div class="quick-facts">
      ${age !== '—' ? `<div class="qf">Age <span>${age}</span></div>` : ''}
      ${p['Date Of Birth'] ? `<div class="qf">DOB <span>${p['Date Of Birth']}</span></div>` : ''}
      ${p['Staying In'] ? `<div class="qf">Location <span>${p['Staying In']}</span></div>` : ''}
      ${p['Work Field'] ? `<div class="qf">Field <span>${p['Work Field']}</span></div>` : ''}
    </div>
    <div class="uid-badge">${uid}</div>
  </div>
</div>

<table>${sectionsHtml}</table>

${horoNote}

<div class="pdf-footer">
  <span>Kathyayini Matrimony — Confidential</span>
  <span>${uid}</span>
  <span>${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
</div>

<script>
  // Wait for images to load then print
  const imgs = document.querySelectorAll('img');
  if (imgs.length === 0) {
    window.print();
  } else {
    let loaded = 0;
    imgs.forEach(img => {
      if (img.complete) { loaded++; if (loaded === imgs.length) window.print(); }
      else {
        img.onload = img.onerror = () => { loaded++; if (loaded === imgs.length) window.print(); };
      }
    });
  }
<\/script>
</body>
</html>`);
  win.document.close();
}

// ── Kept for Escape key handler ────────────────────────────────────────
function closeDownloadManager() {}

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
