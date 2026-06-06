// =====================================================================
// CONFIG
// Each profile's files live in: ./profiles/<UniqueID>/
//   photo1.jpg      first photo  (.jpg/.jpeg/.png/.webp)
//   photo2.jpg      second photo (same)
//   horoscope.*     any extension (.pdf/.jpg/.png/.webp)
// CSV: ./data/profiles.csv
// =====================================================================
// ./data/profiles.csv

const CSV_URL = './data/profiles.csv';
const IMG_EXTENSIONS  = ['pdf','jpg', 'jpeg', 'png', 'webp'];
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
  const u = uid.trim();
  // Primary: <UID>-Photo-1.jpg convention
  return IMG_EXTENSIONS.map(ext => `${base}/${u}-Photo-${slot}.${ext}`);
}

function horoscopeCandidates(uid) {
  const u = uid.trim();
  return HORO_EXTENSIONS.map(ext => `${profileFolder(uid)}/${u}-horoscope.${ext}`);
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
  if (driveUrl) {
    const dv = driveViewUrl(driveUrl);
    if (dv) return dv;
  }
  return null;
}

// ── Image with fallback extensions ───────────────────────────────────

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
    style="width:100%;height:100%;object-fit:contain;display:block;cursor:zoom-in;background:#f5f0ea"
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
            ${buildImgWithFallback(photoCandidates(uid, 1), p['Photo 1 - of Bride or Groom'] || '', symbol)}
          </div>
          <div class="image-slide" data-idx="1">
            ${buildImgWithFallback(photoCandidates(uid, 2), p['Photo 2 - of Bride or Groom'] || '', symbol)}
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

// ── PDF Generator ─────────────────────────────────────────────────────

async function generateProfilePDF(uid) {
  const p = allProfiles.find(x => x['Unique ID'].trim() === uid);
  if (!p) return;

  const isBride   = p['Filling the Form Of'] === 'Bride';
  const accentCol = isBride ? '#9e3040' : '#1f4f8a';
  const typeLabel = p['Filling the Form Of'] || '';
  const age       = getAge(p['Date Of Birth']);
  const filename  = uid + '-profile';

  // Resolve photo URLs: local first, Drive fallback
  async function resolveImg(slot, driveUrl) {
    for (const url of photoCandidates(uid, slot)) {
      if (await urlExists(url)) return url;
    }
    return driveViewUrl(driveUrl) || null;
  }

  const photo1Url = await resolveImg(1, p['Photo 1 - of Bride or Groom'] || '');
  const photo2Url = await resolveImg(2, p['Photo 2 - of Bride or Groom'] || '');
  const horoUrl   = await findHoroscope(uid, p['Horoscope'] || '');

  // Convert URL to base64 for embedding in print window
  async function toBase64(url) {
    if (!url) return null;
    try {
      const fetchUrl = url.includes('drive.google')
        ? 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
        : url;
      const resp = await fetch(fetchUrl);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    } catch { return null; }
  }

  const [b64p1, b64p2] = await Promise.all([toBase64(photo1Url), toBase64(photo2Url)]);

  const photoBlock = [b64p1, b64p2].filter(Boolean)
    .map(src => `<img src="${src}" class="profile-photo">`)
    .join('');

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
      ["Height (in feet) - example 5 / 5`2 / 5`11",'Height'],
    ]},
    { label: 'Professional', keys: [
      ['Education ','Education'],['Education','Education'],
      ['Work Field','Field'],
      ['Mention your degrees ','Degrees'],['Mention your degrees','Degrees'],
      ['Currently Working-In(Company Name) and As(Position)','Company / Role'],
      ['Salary(LPA)','Salary (LPA)'],
    ]},
    { label: 'Family', keys: [
      ["Father's Name",'Father'],["Father's Occupation ",'Father Occ.'],["Father's Occupation",'Father Occ.'],
      ["Mother's Name",'Mother'],['Siblings','Siblings'],["Father's Native","Father's Native"],
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
    return `<tr class="section-head"><td colspan="2">${s.label}</td></tr>${rows}`;
  }).join('');

  const horoNote = horoUrl
    ? `<p class="horo-note">✦ Horoscope on file: <em>${uid}-horoscope</em></p>` : '';

  const win = window.open('', '_blank');
  if (!win) { alert('Please allow popups for this site to generate PDFs.'); return; }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1208; background:#fff; }
    .pdf-header { display:flex; align-items:flex-start; gap:20px; border-bottom:2px solid ${accentCol}; padding-bottom:14px; margin-bottom:16px; }
    .photos { display:flex; gap:10px; flex-shrink:0; }
    .profile-photo { width:110px; height:140px; object-fit:contain; border:1px solid #d6cfc4; border-radius:6px; background:#f5f0ea; }
    .no-photo { width:110px; height:140px; border:1px solid #d6cfc4; border-radius:6px; background:#f5f0ea; display:flex; align-items:center; justify-content:center; font-size:40px; color:#c49a50; }
    .header-text { flex:1; }
    .org-name { font-size:10px; letter-spacing:2.5px; text-transform:uppercase; color:#8b5e1a; margin-bottom:6px; font-weight:600; }
    .profile-name { font-size:24px; font-weight:700; color:#1a1208; font-family:Georgia,serif; line-height:1.2; margin-bottom:8px; }
    .type-badge { display:inline-block; padding:3px 12px; border-radius:20px; font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; background:${accentCol}18; color:${accentCol}; border:1px solid ${accentCol}50; margin-bottom:10px; }
    .quick-facts { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:8px; }
    .qf { font-size:11px; color:#4a3c2c; } .qf span { font-weight:600; color:#1a1208; }
    .uid-badge { font-size:10px; color:#7a6a54; letter-spacing:1px; font-family:monospace; }
    table { width:100%; border-collapse:collapse; }
    tr { break-inside:avoid; }
    td { padding:5px 8px; vertical-align:top; border-bottom:1px solid #ede8e0; }
    td.k { width:32%; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#7a6a54; font-weight:500; padding-top:6px; }
    td.v { font-size:11px; color:#1a1208; line-height:1.5; }
    tr.section-head td { background:${accentCol}10; color:${accentCol}; font-size:9px; font-weight:700; letter-spacing:2px; text-transform:uppercase; padding:6px 8px 4px; border-bottom:1px solid ${accentCol}30; }
    .horo-note { margin-top:14px; font-size:10px; color:#4a3c2c; padding:6px 10px; background:#fdf6e8; border:1px solid #c49a50; border-radius:4px; break-inside:avoid; }
    .pdf-footer { margin-top:18px; padding-top:10px; border-top:1px solid #d6cfc4; font-size:9px; color:#a89080; display:flex; justify-content:space-between; }
  </style>
</head>
<body>
<div class="pdf-header">
  <div class="photos">
    ${photoBlock || `<div class="no-photo">${isBride ? '♀' : '♂'}</div>`}
  </div>
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
  <span>${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</span>
</div>
<script>
  const imgs = document.querySelectorAll('img');
  if (!imgs.length) { window.print(); }
  else {
    let done = 0;
    imgs.forEach(img => {
      const check = () => { done++; if (done >= imgs.length) window.print(); };
      if (img.complete) check(); else { img.onload = check; img.onerror = check; }
    });
  }
<\/script>
</body></html>`);
  win.document.close();
}

// ── Lightbox ───────────────────────────────────────────────────────────

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
  _lbImages = slides.map(s => s.querySelector('img')).filter(Boolean).map(i => i.src).filter(Boolean);
  const clickedSlide = imgEl.closest('.image-slide');
  _lbIndex = slides.indexOf(clickedSlide);
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
function closeLightbox() { document.getElementById('lightbox-overlay').classList.remove('open'); document.removeEventListener('keydown', _lbKeyHandler); }
function closeLightboxOnBg(e) { if (e.target === document.getElementById('lightbox-overlay')) closeLightbox(); }
function _lbKeyHandler(e) { if (e.key==='Escape') closeLightbox(); if (e.key==='ArrowRight') lbNext(); if (e.key==='ArrowLeft') lbPrev(); }

// ── closeDownloadManager stub (for Escape key handler) ────────────────
function closeDownloadManager() {}

// ── Startup ───────────────────────────────────────────────────────────

loadData();
