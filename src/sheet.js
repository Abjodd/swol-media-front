// Reading creator sheets in the browser — CSV or Excel (.xlsx), no extra packages.
// The standard sourcing sheet is: SN, Vendor, Username, Followers, Name, Profile Link,
// Commercial, State, City, District, Genre (other common column names are understood too).

// ── CSV ─────────────────────────────────────────────────────────────────────
// Handles quoted values ("15,000", "Mumbai, MH"), doubled quotes and line breaks inside quotes.
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const delim = (s.split(/\r?\n/, 1)[0].match(/\t/g) || []).length > (s.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

// ── XLSX ────────────────────────────────────────────────────────────────────
// An .xlsx is a zip of XML files. Read the zip directory, inflate the first worksheet and the
// shared strings with the browser's DecompressionStream, and turn the cells into rows.
async function unzip(buf) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This doesn’t look like an Excel file');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    files[name] = { method, size, local };
    p += 46 + nameLen + extra + comment;
  }
  const read = async (name) => {
    const f = files[name];
    if (!f) return null;
    const start = f.local + 30 + v.getUint16(f.local + 26, true) + v.getUint16(f.local + 28, true);
    const raw = new Uint8Array(buf, start, f.size);
    if (f.method === 0) return dec.decode(raw);
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(await new Response(stream).arrayBuffer());
  };
  return { read, names: Object.keys(files) };
}

const colIndex = (ref) => {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(file) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t read Excel files — save the sheet as CSV instead');
  const zip = await unzip(await file.arrayBuffer());
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  // first sheet in workbook order
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await zip.read('xl/workbook.xml');
  const rels = await zip.read('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = xml(wb).getElementsByTagName('sheet')[0];
    const rid = first?.getAttribute('r:id') || first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = [...xml(rels).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
    if (rel) sheetPath = 'xl/' + rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const sheet = await zip.read(sheetPath);
  if (!sheet) throw new Error('Couldn’t find a worksheet in this file');
  const shared = [];
  const ss = await zip.read('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
  const rows = [];
  for (const r of xml(sheet).getElementsByTagName('row')) {
    const out = [];
    for (const c of r.getElementsByTagName('c')) {
      const t = c.getAttribute('t');
      const val = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let text;
      if (t === 's') text = shared[+val] ?? '';
      else if (t === 'inlineStr') text = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      else if (t === 'b') text = val === '1' ? 'TRUE' : 'FALSE';
      else text = val;
      out[colIndex(c.getAttribute('r') || '')] = String(text).trim();
    }
    rows.push(Array.from(out, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some(Boolean));
}

export async function readSheetFile(file) {
  if (/\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml')) return readXlsx(file);
  if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files aren’t supported — save as .xlsx or CSV');
  return parseCsv(await file.text());
}

// ── Columns → creator fields ────────────────────────────────────────────────
const ALIASES = {
  sn: ['sn', 's.no', 's no', 'sno', 'sr', 'sr no', 'sr. no', 'serial', '#'],
  vendor: ['vendor', 'vendor name', 'agency'],
  handle: ['username', 'user name', 'handle', 'instagram id', 'insta id', 'id', 'instagram handle', 'channel'],
  followers: ['followers', 'follower', 'subscribers', 'followers count'],
  name: ['name', 'creator', 'creator name', 'full name', 'influencer', 'influencer name'],
  link: ['profile link', 'link', 'url', 'profile', 'profile url', 'instagram link', 'channel link'],
  commercial: ['commercial', 'commercials', 'rate', 'price', 'cost', 'charges', 'fee', 'quote'],
  state: ['state'],
  city: ['city', 'location'],
  district: ['district'],
  genre: ['genre', 'category', 'categories', 'niche', 'content type'],
  following: ['following'],
  avgViews: ['avg views', 'average views', 'avg. views', 'views'],
  engagement: ['engagement', 'engagement rate', 'er', 'er%', 'engagement %'],
  photo: ['photo', 'pfp', 'avatar', 'image', 'profile photo'],
  phone: ['phone', 'mobile', 'contact', 'contact number', 'number', 'whatsapp'],
  email: ['email', 'email id', 'mail'],
  bio: ['bio', 'about'],
  note: ['note', 'notes', 'remarks', 'comment'],
};
const norm = (h) => String(h || '').toLowerCase().replace(/[_*]/g, ' ').replace(/\s+/g, ' ').trim();

// Find the header row (within the first few rows) and map its columns to fields.
export function mapColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const head = rows[r].map(norm);
    const cols = {};
    for (const [field, names] of Object.entries(ALIASES)) {
      const i = head.findIndex((h) => names.includes(h));
      if (i >= 0) cols[field] = i;
    }
    if (cols.handle !== undefined || cols.link !== undefined) return { headerRow: r, cols, headers: rows[r] };
  }
  return null;
}

// rows (arrays) → entries for the API; rows without a username or link are reported, not sent
export function rowsToEntries(rows) {
  const map = mapColumns(rows);
  if (!map) return { entries: [], problems: [], map: null };
  const entries = [];
  const problems = [];
  rows.slice(map.headerRow + 1).forEach((r, i) => {
    const e = {};
    for (const [field, idx] of Object.entries(map.cols)) if (field !== 'sn' && r[idx]) e[field] = r[idx];
    if (!e.link && !e.handle) {
      if (Object.keys(e).length) problems.push({ row: map.headerRow + i + 2, reason: 'No username or profile link' });
      return;
    }
    e._row = map.headerRow + i + 2;
    entries.push(e);
  });
  return { entries, problems, map };
}

export const TEMPLATE_HEADERS = ['SN', 'Vendor', 'Username', 'Followers', 'Name', 'Profile Link', 'Commercial', 'State', 'City', 'District', 'Genre'];
