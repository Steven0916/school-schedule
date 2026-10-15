'use strict';

// 期程統整與公開觀課頁面共用的工具

// ---------- 圖示（Lucide） ----------

const ICONS = {
  'calendar-days':
    '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/><path d="M8 17h.01"/><path d="M12 17h.01"/><path d="M16 17h.01"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  'clipboard-list':
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
  'layout-grid':
    '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
  'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  paperclip:
    '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  'circle-check-big': '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
};

const CATEGORY_ICON = { 會議: 'users', 工作: 'clipboard-list', 觀課計畫: 'eye', 重要行事: 'flag' };

function icon(name, size = 16) {
  const t = document.createElement('template');
  t.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}

// ---------- DOM 小工具 ----------

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (key === 'value') value = v;
    else if (key === 'className') el.className = v;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), v);
    else el.setAttribute(key, v === true ? '' : v);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === '') continue;
    el.append(child instanceof Node ? child : String(child));
  }
  if (value !== undefined) el.value = value;
  return el;
}

async function api(url, options = {}) {
  const opts = { cache: 'no-store', ...options };
  if (opts.body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json', ...opts.headers };
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || '操作失敗，請稍後重試。');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const todayTaipei = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
const fmt = (d) => d.replaceAll('-', '/');
const endOf = (e) => e.endDate || e.startDate;
const byDate = (a, b) =>
  a.startDate.localeCompare(b.startDate) || (a.time || '').localeCompare(b.time || '') || a.id - b.id;
const $ = (id) => document.getElementById(id);

// ---------- 通知 ----------

let noticeTimer;
function notify(message) {
  const el = $('notice');
  el.replaceChildren(
    message,
    h('button', { 'aria-label': '關閉通知', onClick: () => (el.hidden = true) }, icon('x', 16))
  );
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (el.hidden = true), 5000);
}

// ---------- 對話框 ----------

const modal = $('modal');
let modalBusy = false;

modal.addEventListener('cancel', (e) => {
  if (modalBusy) e.preventDefault();
});
modal.addEventListener('click', (e) => {
  if (e.target === modal && !modalBusy) modal.close();
});

function openModal(title, description, body, className = '') {
  modalBusy = false;
  modal.className = `modal ${className}`;
  modal.replaceChildren(
    h(
      'button',
      { type: 'button', className: 'modal-close', 'aria-label': '關閉', onClick: () => !modalBusy && modal.close() },
      icon('x', 18)
    ),
    h('h2', { className: 'modal-title' }, title),
    description ? h('p', { className: 'modal-desc' }, description) : null,
    body
  );
  if (!modal.open) modal.showModal();
}

function closeModal() {
  modalBusy = false;
  modal.close();
}

function setError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}


// 需輸入確認文字的對話框（刪除／復原）
function openConfirmText({ title, description, phrase, confirmLabel, busyLabel, tone, onConfirm }) {
  const input = h('input', { type: 'text', autocomplete: 'off', placeholder: `請輸入${phrase}` });
  const error = h('p', { className: 'form-error', role: 'alert', hidden: true });
  const cancel = h('button', { type: 'button', className: 'cancel-button', onClick: closeModal }, '取消');
  const confirm = h('button', { type: 'button', className: `${tone}-button`, disabled: true }, confirmLabel);
  input.addEventListener('input', () => {
    confirm.disabled = input.value !== phrase;
    setError(error, '');
  });
  confirm.addEventListener('click', async () => {
    if (input.value !== phrase) {
      setError(error, `請輸入「${phrase}」。`);
      return;
    }
    modalBusy = true;
    confirm.disabled = cancel.disabled = input.disabled = true;
    confirm.textContent = busyLabel;
    try {
      await onConfirm(input.value);
      closeModal();
    } catch (err) {
      modalBusy = false;
      cancel.disabled = input.disabled = false;
      confirm.disabled = input.value !== phrase;
      confirm.textContent = confirmLabel;
      setError(error, err.message);
    }
  });
  openModal(
    title,
    description,
    h(
      'div',
      {},
      h('label', { className: 'delete-confirm-label' }, `若要${phrase.slice(2)}請輸入密碼「${phrase}」`, input),
      error,
      h('div', { className: 'modal-actions' }, cancel, confirm)
    )
  );
  input.focus();
}

// ---------- 左側選單（所有頁面共用） ----------

const SIDE_LINKS = [
  { href: '/', path: '/', label: '期程清單', icon: 'calendar-days' },
  { href: '/completed', path: '/completed', label: '已完成工作', icon: 'circle-check-big' },
  { href: '/observations', path: '/observations', label: '公開觀課填報', icon: 'eye' },
  { href: '/team', path: '/team', label: '計畫成員', icon: 'users' },
];

function mountSideNav() {
  const links = SIDE_LINKS.map((l) => ({
    ...l,
    el: h('a', { href: l.href, className: 'side-link' }, icon(l.icon, 18), h('span', {}, l.label)),
  }));
  for (const l of links) {
    if (l.path === location.pathname) l.el.setAttribute('aria-current', 'page');
  }
  // 選單固定顯示：電腦在左側，手機在頂端（可左右滑動）
  const nav = h(
    'nav',
    { id: 'side-nav', className: 'side-nav', 'aria-label': '主選單' },
    h('p', { className: 'side-nav-title' }, '選單'),
    links.map((l) => l.el)
  );

  // 往下捲動後，左下角顯示「回到最上方」
  const toTop = h('button', { type: 'button', className: 'float-button' }, icon('arrow-up', 18), h('span', {}, '最上方'));
  const floatBar = h('div', { className: 'float-actions' }, toTop);
  toTop.addEventListener('click', () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    (nav.querySelector('[aria-current=page]') || links[0].el).focus({ preventScroll: true });
  });
  const updateFloat = () => floatBar.classList.toggle('visible', window.scrollY > 200);
  window.addEventListener('scroll', updateFloat, { passive: true });

  document.body.prepend(nav);
  document.body.append(floatBar);
  document.body.classList.add('has-side-nav');
  updateFloat();
  // 手機版為橫向捲動，讓目前頁面的連結露出來
  const current = nav.querySelector('[aria-current=page]');
  if (current && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = current.offsetLeft - 16;
}

mountSideNav();

// ---------- 匯出 Excel（.xlsx，不需外部套件） ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 不壓縮的 ZIP（xlsx 本身就是 zip）
function zipFiles(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 檔名
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(local, nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const xmlEscape = (v) =>
  String(v)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const colName = (i) => (i >= 26 ? colName(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
// 中日韓文字算兩個字寬
const textWidth = (v) => [...String(v)].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);

function buildXlsx(sheetName, headers, rows) {
  const all = [headers, ...rows];
  const cell = (v, r, c, style) => {
    const ref = `${colName(c)}${r + 1}`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(v ?? '')}</t></is></c>`;
  };
  const sheetRows = all
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c, r === 0 ? ' s="1"' : '')).join('')}</row>`)
    .join('');
  const cols = headers
    .map((_, c) => {
      const w = Math.min(60, Math.max(8, ...all.map((row) => textWidth(row[c] ?? '') + 2)));
      return `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`;
    })
    .join('');
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const safeName = sheetName.replace(/[[\]:*?/\\]/g, '').slice(0, 31) || 'Sheet1';
  return zipFiles([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${xmlEscape(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      'xl/styles.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="12"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="12"/><name val="Microsoft JhengHei"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
    ],
    [
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`,
    ],
  ]);
}

function downloadXlsx(filename, sheetName, headers, rows) {
  const url = URL.createObjectURL(buildXlsx(sheetName, headers, rows));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 學校與縣市（由管理者設定，全站共用） ----------

const COUNTIES = ['雲林縣', '嘉義縣'];
let SCHOOLS = []; // [{ id, name, county }]，依縣市排序

async function loadSchools() {
  try {
    SCHOOLS = await api('/api/schools');
  } catch {
    SCHOOLS = [];
  }
  return SCHOOLS;
}

const schoolCounty = (name) => SCHOOLS.find((s) => s.name === name)?.county || '';

// ---------- 依縣市篩選（期程、已完成工作、觀課共用） ----------

// 期程所屬縣市：參與學校、地點、建立學校對應到的縣市；都沒有則為「共同」（空陣列，兩縣都顯示）
function eventCounties(e) {
  const names = [...(e.schools || []), e.location, e.createdBySchool].filter(Boolean);
  return COUNTIES.filter((c) => names.some((n) => schoolCounty(n) === c));
}

const countyLabel = (counties) => (counties.length ? counties.join('、') : '共同');
// county 為「全部」或沒有縣市資訊時都顯示
const inCounty = (counties, county) => county === '全部' || !counties.length || counties.includes(county);

// 篩選選擇記在瀏覽器（跨頁面共用）；學校帳號第一次使用時預設為本校所在縣市
function initialCounty(role, schoolName) {
  try {
    const saved = localStorage.getItem('countyFilter');
    if (saved === '全部' || COUNTIES.includes(saved)) return saved;
  } catch {}
  return role === 'school' ? schoolCounty(schoolName) || '全部' : '全部';
}

function saveCounty(county) {
  try {
    localStorage.setItem('countyFilter', county);
  } catch {}
}

function countyFilterButtons(current, onChange) {
  return h(
    'div',
    { className: 'county-filter', role: 'group', 'aria-label': '依縣市篩選' },
    ['全部', ...COUNTIES].map((c) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(current === c),
          className: current === c ? 'filter active' : 'filter',
          onClick: () => {
            saveCounty(c);
            onChange(c);
          },
        },
        c === '全部' ? '全部縣市' : c
      )
    )
  );
}
