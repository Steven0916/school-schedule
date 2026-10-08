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
  if (!res.ok) throw new Error(data.error || '操作失敗，請稍後重試。');
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
  { href: '/#schedule', path: '/', hash: '#schedule', label: '期程清單', icon: 'calendar-days' },
  { href: '/#completed', path: '/', hash: '#completed', label: '已完成工作', icon: 'circle-check-big' },
  { href: '/observations', path: '/observations', label: '公開觀課填報', icon: 'eye' },
  { href: '/team', path: '/team', label: '計畫成員', icon: 'users' },
];

function mountSideNav() {
  const links = SIDE_LINKS.map((l) => ({
    ...l,
    el: h('a', { href: l.href, className: 'side-link' }, icon(l.icon, 18), h('span', {}, l.label)),
  }));
  const markCurrent = () => {
    const onHome = location.pathname === '/';
    const hash = location.hash === '#completed' ? '#completed' : '#schedule';
    for (const l of links) {
      const current = l.path === location.pathname && (!onHome || l.hash === hash);
      if (current) l.el.setAttribute('aria-current', 'page');
      else l.el.removeAttribute('aria-current');
    }
  };
  markCurrent();
  window.addEventListener('hashchange', markCurrent);
  const nav = h(
    'nav',
    { className: 'side-nav', 'aria-label': '主選單' },
    h('p', { className: 'side-nav-title' }, '選單'),
    links.map((l) => l.el)
  );
  document.body.prepend(nav);
  document.body.classList.add('has-side-nav');
  // 手機版選單為橫向捲動，讓目前頁面的連結露出來
  const current = nav.querySelector('[aria-current=page]');
  if (current && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = current.offsetLeft - 16;
}

mountSideNav();
