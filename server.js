'use strict';

// 期程統整 — 零相依 Node.js 伺服器（需 Node 18 以上）
// 啟動：node server.js
// 重設管理者密碼：node server.js --reset-admin <新密碼>

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'sid';

const CATEGORIES = ['會議', '工作', '觀課計畫', '重要行事'];
const LOCATIONS = ['線上會議', '石榴國中', '東榮國中', '永慶高中'];
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- 密碼與工作階段 ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 9 || password.length > 128) {
    throw new HttpError(400, '密碼長度需為 9 到 128 個字元。');
  }
}

function validateUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new HttpError(400, '帳號需為 3 到 40 個英數字，可使用 . _ -');
  }
}

// ---------- 資料儲存（JSON 檔） ----------

function saveDb() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const fresh = {
    admin: { username: 'admin', passwordHash: hashPassword(password) },
    members: [],
    events: [],
    sessions: [],
    nextId: { member: 1, event: 1 },
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
  console.log('================================================');
  console.log(' 已建立新的資料庫');
  console.log(` 管理者帳號：admin`);
  console.log(` 管理者密碼：${password}`);
  console.log(' 請登入後於「帳號與權限」修改密碼。');
  console.log('================================================');
  return fresh;
}

let db = loadDb();

// ---------- 工具 ----------

const todayTaipei = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

const byDate = (a, b) =>
  a.startDate.localeCompare(b.startDate) || (a.time || '').localeCompare(b.time || '') || a.id - b.id;

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function optionalString(value, max, label) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw new HttpError(400, `${label}格式錯誤。`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `${label}不可超過 ${max} 個字。`);
  return trimmed;
}

function normalizeEvent(body) {
  const title = optionalString(body.title, 120, '項目名稱');
  if (!title) throw new HttpError(400, '請填寫項目名稱。');
  if (!CATEGORIES.includes(body.category)) throw new HttpError(400, '類別不正確。');
  if (!isValidDate(body.startDate)) throw new HttpError(400, '請選擇有效的開始日期。');
  const endDate = body.endDate ? String(body.endDate) : '';
  if (endDate && !isValidDate(endDate)) throw new HttpError(400, '結束日期格式錯誤。');
  if (endDate && endDate < body.startDate) throw new HttpError(400, '結束日期不能早於開始日期。');
  const time = body.time ? String(body.time) : '';
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, '時間格式錯誤。');
  const location = body.location ? String(body.location) : '';
  if (location && !LOCATIONS.includes(location)) throw new HttpError(400, '地點不正確。');
  return {
    title,
    category: body.category,
    startDate: body.startDate,
    endDate,
    time,
    location,
    owner: optionalString(body.owner, 80, '主辦'),
    notes: optionalString(body.notes, 500, '備註'),
  };
}

function canDeleteEvent(event, session) {
  if (!session) return false;
  if (session.role === 'owner') return true;
  return event.createdByMemberId === session.member.id;
}

function serializeEvent(event, session) {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    startDate: event.startDate,
    endDate: event.endDate || '',
    time: event.time || '',
    location: event.location || '',
    owner: event.owner || '',
    notes: event.notes || '',
    createdBySchool: event.createdBySchool || null,
    completedAt: event.completedAt || null,
    deletedAt: event.deletedAt || null,
    canDelete: canDeleteEvent(event, session),
  };
}

const serializeMember = (m) => ({ id: m.id, schoolName: m.schoolName, username: m.username });

function findEvent(id, { deleted = false } = {}) {
  const event = db.events.find((e) => e.id === id && !!e.deletedAt === deleted);
  if (!event) throw new HttpError(404, '找不到這筆期程。');
  return event;
}

// ---------- Cookie / 工作階段 ----------

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isSecure(req) {
  return process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(req, res, token, maxAgeSec) {
  const parts = [`${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function createSession(req, res, role, memberId = null) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.sessions = db.sessions.filter((s) => s.expiresAt > now);
  db.sessions.push({ id: sha256(token), role, memberId, expiresAt: now + SESSION_TTL_MS });
  saveDb();
  setSessionCookie(req, res, token, SESSION_TTL_MS / 1000);
}

function getSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const record = db.sessions.find((s) => s.id === sha256(token));
  if (!record || record.expiresAt < Date.now()) return null;
  if (record.role === 'owner') return { role: 'owner', record };
  const member = db.members.find((m) => m.id === record.memberId);
  return member ? { role: 'school', member, record } : null;
}

function destroySession(req, res) {
  const session = getSession(req);
  if (session) {
    db.sessions = db.sessions.filter((s) => s !== session.record);
    saveDb();
  }
  setSessionCookie(req, res, '', 0);
}

function requireOwner(session) {
  if (session?.role !== 'owner') throw new HttpError(403, '需要管理者權限。');
}

function requireEditor(session) {
  if (!session) throw new HttpError(401, '請先登入。');
}

// ---------- 登入次數限制 ----------

const loginFailures = new Map();

function clientKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function checkLoginLock(req) {
  const f = loginFailures.get(clientKey(req));
  if (f && f.until > Date.now()) throw new HttpError(429, '登入失敗次數過多，請 15 分鐘後再試。');
}

function recordLoginFailure(req) {
  const key = clientKey(req);
  const f = loginFailures.get(key) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= 5) {
    f.until = Date.now() + 15 * 60 * 1000;
    f.count = 0;
  }
  loginFailures.set(key, f);
}

// ---------- API 路由 ----------

const routes = [];

function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp(
    `^${pattern.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '(\\d+)';
    })}$`
  );
  routes.push({ method, re, keys, handler });
}

route('GET', '/api/me', ({ session }) => {
  if (!session) return { role: 'viewer' };
  if (session.role === 'owner') return { role: 'owner', username: db.admin.username };
  return { role: 'school', schoolName: session.member.schoolName, username: session.member.username };
});

// 管理者登入 / 登出 / 帳密
route('POST', '/api/admin/login', ({ req, res, body }) => {
  checkLoginLock(req);
  if (body.username !== db.admin.username || !verifyPassword(body.password || '', db.admin.passwordHash)) {
    recordLoginFailure(req);
    throw new HttpError(401, '帳號或密碼錯誤。');
  }
  createSession(req, res, 'owner');
  return { ok: true };
});

route('POST', '/api/admin/logout', ({ req, res }) => {
  destroySession(req, res);
  return { ok: true };
});

route('GET', '/api/admin/credentials', ({ session }) => {
  requireOwner(session);
  return { username: db.admin.username };
});

route('PUT', '/api/admin/credentials', ({ req, res, session, body }) => {
  requireOwner(session);
  if (!verifyPassword(body.currentPassword || '', db.admin.passwordHash)) {
    throw new HttpError(400, '目前密碼不正確。');
  }
  validateUsername(body.username);
  validatePassword(body.password);
  db.admin = { username: body.username, passwordHash: hashPassword(body.password) };
  db.sessions = db.sessions.filter((s) => s.role !== 'owner');
  saveDb();
  setSessionCookie(req, res, '', 0);
  return { ok: true };
});

// 學校端登入 / 登出
route('POST', '/api/schools/login', ({ req, res, body }) => {
  checkLoginLock(req);
  const username = String(body.username || '').toLowerCase();
  const member = db.members.find((m) => m.username.toLowerCase() === username);
  if (!member || !verifyPassword(body.password || '', member.passwordHash)) {
    recordLoginFailure(req);
    throw new HttpError(401, '帳號或密碼錯誤。');
  }
  createSession(req, res, 'school', member.id);
  return { ok: true };
});

route('POST', '/api/schools/logout', ({ req, res }) => {
  destroySession(req, res);
  return { ok: true };
});

// 學校端帳號管理（管理者）
route('GET', '/api/schools/members', ({ session }) => {
  requireOwner(session);
  return db.members
    .map(serializeMember)
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.username.localeCompare(b.username));
});

route('POST', '/api/schools/members', ({ session, body }) => {
  requireOwner(session);
  const schoolName = optionalString(body.schoolName, 80, '學校名稱');
  if (!schoolName) throw new HttpError(400, '請填寫學校名稱。');
  validateUsername(body.username);
  validatePassword(body.password);
  if (db.members.some((m) => m.username.toLowerCase() === body.username.toLowerCase())) {
    throw new HttpError(409, '此帳號已被使用。');
  }
  const member = {
    id: db.nextId.member++,
    schoolName,
    username: body.username,
    passwordHash: hashPassword(body.password),
  };
  db.members.push(member);
  saveDb();
  return serializeMember(member);
});

route('PATCH', '/api/schools/members/:id', ({ session, params, body }) => {
  requireOwner(session);
  const member = db.members.find((m) => m.id === params.id);
  if (!member) throw new HttpError(404, '找不到這個帳號。');
  validatePassword(body.password);
  member.passwordHash = hashPassword(body.password);
  db.sessions = db.sessions.filter((s) => s.memberId !== member.id);
  saveDb();
  return serializeMember(member);
});

route('DELETE', '/api/schools/members/:id', ({ session, params }) => {
  requireOwner(session);
  const member = db.members.find((m) => m.id === params.id);
  if (!member) throw new HttpError(404, '找不到這個帳號。');
  db.members = db.members.filter((m) => m !== member);
  db.sessions = db.sessions.filter((s) => s.memberId !== member.id);
  saveDb();
  return { ok: true };
});

// 期程
route('GET', '/api/events', ({ session }) =>
  db.events.filter((e) => !e.deletedAt).sort(byDate).map((e) => serializeEvent(e, session))
);

route('GET', '/api/events/trash', ({ session }) => {
  requireEditor(session);
  return db.events
    .filter((e) => e.deletedAt && canDeleteEvent(e, session))
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    .map((e) => serializeEvent(e, session));
});

route('POST', '/api/events', ({ session, body }) => {
  requireEditor(session);
  const event = {
    id: db.nextId.event++,
    ...normalizeEvent(body),
    createdBySchool: session.role === 'school' ? session.member.schoolName : null,
    createdByMemberId: session.role === 'school' ? session.member.id : null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    deletedAt: null,
  };
  db.events.push(event);
  saveDb();
  return serializeEvent(event, session);
});

route('PUT', '/api/events/:id', ({ session, params, body }) => {
  requireOwner(session);
  const event = findEvent(params.id);
  Object.assign(event, normalizeEvent(body), { updatedAt: new Date().toISOString() });
  saveDb();
  return serializeEvent(event, session);
});

route('PATCH', '/api/events/:id', ({ session, params, body }) => {
  requireOwner(session);
  if (typeof body.completed !== 'boolean') throw new HttpError(400, '請提供完成狀態。');
  const event = findEvent(params.id);
  event.completedAt = body.completed ? new Date().toISOString() : null;
  saveDb();
  return serializeEvent(event, session);
});

route('DELETE', '/api/events/:id', ({ session, params, body }) => {
  requireEditor(session);
  if (body.confirmation !== '確定刪除') throw new HttpError(400, '請輸入「確定刪除」。');
  const event = findEvent(params.id);
  if (!canDeleteEvent(event, session)) throw new HttpError(403, '只能刪除自己新增的項目。');
  event.deletedAt = new Date().toISOString();
  saveDb();
  return { ok: true };
});

route('POST', '/api/events/:id/restore', ({ session, params, body }) => {
  requireEditor(session);
  if (body.confirmation !== '確定復原') throw new HttpError(400, '請輸入「確定復原」。');
  const event = findEvent(params.id, { deleted: true });
  if (!canDeleteEvent(event, session)) throw new HttpError(403, '只能復原自己新增的項目。');
  event.deletedAt = null;
  saveDb();
  return serializeEvent(event, session);
});

// ---------- 靜態頁面 ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const LOGIN_PAGES = {
  '/admin/login': {
    role: 'admin',
    title: '管理者登入',
    desc: '使用管理者帳號密碼管理期程與學校端權限。',
    username: 'admin',
  },
  '/school/login': {
    role: 'school',
    title: '學校端登入',
    desc: '使用管理者提供的帳號與密碼。',
    username: '',
  },
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function sendFile(res, file, transform) {
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(full)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('找不到頁面');
    return;
  }
  let content = fs.readFileSync(full);
  if (transform) content = transform(content.toString('utf8'));
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(content);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new HttpError(413, '資料過大。'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new HttpError(400, '資料格式錯誤。'));
      }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'"
  );

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    const match = routes
      .filter((r) => r.method === req.method)
      .map((r) => ({ r, m: r.re.exec(pathname) }))
      .find((x) => x.m);
    if (!match) return sendJson(res, 404, { error: '找不到 API。' });
    try {
      const params = {};
      match.r.keys.forEach((k, i) => (params[k] = Number(match.m[i + 1])));
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      const data = await match.r.handler({ req, res, params, body, session: getSession(req) });
      return sendJson(res, 200, data);
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      return sendJson(res, 500, { error: '伺服器發生錯誤，請稍後重試。' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }

  if (pathname === '/') return sendFile(res, 'index.html');

  const login = LOGIN_PAGES[pathname];
  if (login) {
    const session = getSession(req);
    if (session && (session.role === 'owner') === (login.role === 'admin')) {
      res.writeHead(302, { Location: '/' });
      return res.end();
    }
    return sendFile(res, 'login.html', (html) =>
      html
        .replaceAll('{{ROLE}}', login.role)
        .replaceAll('{{TITLE}}', escapeHtml(login.title))
        .replaceAll('{{DESC}}', escapeHtml(login.desc))
        .replaceAll('{{USERNAME}}', escapeHtml(login.username))
    );
  }

  if (/^\/[\w.-]+\.(css|js|svg)$/.test(pathname)) return sendFile(res, pathname.slice(1));

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('找不到頁面');
}

// ---------- 啟動 ----------

const resetIndex = process.argv.indexOf('--reset-admin');
if (resetIndex !== -1) {
  const password = process.argv[resetIndex + 1];
  try {
    validatePassword(password);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  db.admin.passwordHash = hashPassword(password);
  db.sessions = db.sessions.filter((s) => s.role !== 'owner');
  saveDb();
  console.log(`已重設管理者（${db.admin.username}）密碼。`);
  process.exit(0);
}

http.createServer(handle).listen(PORT, () => {
  console.log(`期程統整已啟動：http://localhost:${PORT}`);
});
