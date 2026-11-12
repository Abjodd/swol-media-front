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
  constituency: ['constituency', 'assembly constituency', 'ac', 'pc', 'lok sabha', 'lok sabha constituency', 'vidhan sabha', 'assembly', 'seat'],
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

export const TEMPLATE_HEADERS = ['SN', 'Vendor', 'Username', 'Followers', 'Name', 'Profile Link', 'Commercial', 'State', 'City', 'District', 'Constituency', 'Genre'];

// ── Price sheets: two columns — username or profile link, and the price ─────
// Headers are optional; without them the first column is the creator and the second the price.
export function rowsToPrices(rows) {
  const isWho = (h) => /user ?name|handle|profile|link|url|creator|instagram|insta|channel|^id$|^name$/.test(norm(h));
  const isPrice = (h) => /price|client|cost|amount|rate|commercial|fee|charges|quote|₹|inr/.test(norm(h));
  let start = 0;
  let who = 0;
  let price = 1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i].map(norm);
    const w = r.findIndex((h) => h && isWho(h) && !/^https?:/.test(h));
    const p = r.findIndex((h, j) => j !== w && h && isPrice(h));
    if (w >= 0 && p >= 0) {
      who = w;
      price = p;
      start = i + 1;
      break;
    }
  }
  // no header found: skip a first row whose "price" isn't a number
  if (start === 0 && rows[0] && !/\d/.test(String(rows[0][1] ?? ''))) start = 1;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const input = String(rows[i][who] ?? '').trim();
    const value = String(rows[i][price] ?? '').trim();
    if (input || value) out.push({ input, price: value, _row: i + 1 });
  }
  return { rows: out, header: start > 0 ? [rows[start - 1]?.[who], rows[start - 1]?.[price]] : null };
}

// ── "Update from sheet": a creator column + any other columns, each mapped to a field ──────────
// Fields the server can overwrite; anything else becomes one of the campaign's own extra columns.
export const OVERRIDE_FIELDS = [
  ['price', 'Price (for the client)'],
  ['cost', 'Cost (vendor)'],
  ['vendor', 'Vendor'],
  ['state', 'State'],
  ['city', 'City'],
  ['district', 'District'],
  ['constituency', 'Constituency'],
  ['followers', 'Followers'],
  ['name', 'Name'],
  ['genre', 'Genre'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['bio', 'Bio'],
  ['avgViews', 'Avg views'],
];
const GUESS = [
  ['price', /^(price|client price|client cost|final price|selling price|price for client|client rate|quote to client)$/],
  ['cost', /(^cost$|vendor cost|commercial|vendor rate|vendor price|charges|^fee|^rate$|quote)/],
  ['vendor', /(vendor|agency)/],
  ['constituency', /(constituency|assembly|vidhan|lok sabha|^ac$|^pc$|^seat$)/],
  ['district', /district/],
  ['state', /^state/],
  ['city', /^(city|location|town)$/],
  ['followers', /(followers|subscribers|^fans$)/],
  ['avgViews', /(avg|average).*views|^views$/],
  ['name', /^(name|full name|creator name|influencer name)$/],
  ['genre', /(genre|categor|niche|content type)/],
  ['phone', /(phone|mobile|whatsapp|contact no|contact number)/],
  ['email', /e-?mail/],
  ['bio', /^(bio|about)$/],
];
const WHO = /(user ?name|handle|profile|link|url|creator id|insta|instagram|channel|youtube|^id$|^creator$)/;
const looksLikeWho = (v) => /^@|instagram\.com|youtube\.com|youtu\.be|facebook\.com|^https?:/i.test(String(v || '').trim());
export const guessField = (header, preset) => {
  const h = norm(header);
  if (!h) return null;
  if (preset === 'price' && /(^price|^cost$|commercial|rate|amount|^₹)/.test(h)) return 'price';
  for (const [field, rx] of GUESS) if (rx.test(h)) return field;
  return null;
};

// rows (arrays, from a file or a paste) → { header, creatorCol, columns: [{ index, header, field, name }], body }
// preset ('price' | 'vendor' | 'location' | 'any') decides what a sheet without headers holds.
export function readOverride(rows, preset = 'any') {
  rows = rows.filter((r) => r.some((x) => String(x ?? '').trim()));
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i];
    if (r.some((c) => WHO.test(norm(c)) || guessField(c)) && !r.some(looksLikeWho)) {
      headerRow = i;
      break;
    }
  }
  const width = Math.max(0, ...rows.map((r) => r.length));
  const header = headerRow >= 0 ? rows[headerRow].map((x) => String(x ?? '').trim()) : null;
  let creatorCol = 0;
  if (header) {
    const w = header.findIndex((h) => WHO.test(norm(h)));
    if (w >= 0) creatorCol = w;
  } else {
    // no headers: the column whose cells look like handles / links
    const sample = rows.slice(0, 20);
    const score = (i) => sample.filter((r) => looksLikeWho(r[i]) || /^[a-z0-9._]{3,30}$/i.test(String(r[i] || '').trim())).length;
    let best = 0;
    for (let i = 1; i < width; i++) if (score(i) > score(best)) best = i;
    creatorCol = best;
  }
  const others = Array.from({ length: width }, (_, i) => i).filter((i) => i !== creatorCol);
  const LOCATION = others.length === 1 ? ['constituency'] : ['state', 'city', 'district', 'constituency'];
  const used = new Set();
  const columns = others.map((index, k) => {
    const head = header ? header[index] : '';
    let field = header ? guessField(head, preset) : preset === 'price' && k === 0 ? 'price' : preset === 'vendor' && k === 0 ? 'vendor' : preset === 'location' ? LOCATION[k] || null : null;
    if (field && used.has(field)) field = null; // two columns can't fill the same field
    if (field) used.add(field);
    const name = head || `Column ${index + 1}`;
    return { index, header: head, field: field || 'extra', name: name.slice(0, 40) };
  });
  const body = rows.slice(headerRow + 1).map((r, i) => ({ _row: headerRow + i + 2, cells: r.map((x) => String(x ?? '').trim()) }));
  return { header, headerRow, creatorCol, columns, body };
}

// a pasted block: tabs (copied from Excel / Google Sheets) or, on typed lines, "who, value"
export function pasteRows(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim())
    .map((l) => {
      if (l.includes('\t')) return l.split('\t').map((x) => x.trim());
      const m = l.trim().match(/^(\S+?)[\s,;|]+(.+)$/); // first thing = who, the rest = the value ("₹15,000" keeps its comma)
      return m ? [m[1].replace(/[,;|]$/, ''), m[2].trim()] : [l.trim()];
    });
}
