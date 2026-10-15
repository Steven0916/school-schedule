// 期程統整 — Cloudflare Worker（API + 靜態頁面），資料存在 D1。

const CATEGORIES = ['會議', '工作', '觀課計畫', '重要行事'];
// 學校清單存在資料表 schools（管理者在網站上維護），地點另外多一個「線上會議」
const ONLINE_LOCATION = '線上會議';
const GRADES = [7, 8, 9, 10, 11, 12]; // 國中七～九年級、高中部十～十二年級
const TEAM_ROLES = ['總召', '副總召', '計畫主持人', '協同主持人'];
const TEAM_TITLES = ['校長', '主任', '組長', '教師', '職員'];
const TEAM_COUNTIES = ['雲林縣', '嘉義縣'];
const AI_MODES = ['AI備課', 'AI教學', 'AI評量', 'AI協作', 'AI創作', 'AI探究'];
const SCHOOL_PASSWORD_MIN = 6;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'sid';
// Workers 免費方案每次請求 CPU 上限 10ms；50,000 次約 7ms。
const PBKDF2_ITERATIONS = 50000;

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// ---------- 密碼與雜湊 ----------

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array((hex.match(/../g) || []).map((h) => parseInt(h, 16)));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

async function verifyPassword(password, stored) {
  const [scheme, iterations, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2') return false;
  const actual = await pbkdf2(String(password || ''), fromHex(saltHex), Number(iterations));
  const expected = fromHex(hashHex);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

// 學校端密碼的可還原副本（讓管理者查看）。金鑰：PASSWORD_KEY（32 bytes base64）
async function passwordKey(env) {
  const raw = env.PASSWORD_KEY ? Uint8Array.from(atob(env.PASSWORD_KEY), (c) => c.charCodeAt(0)) : null;
  if (!raw || raw.length !== 32) return null;
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptPassword(env, password) {
  const key = await passwordKey(env);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(password));
  return `${toHex(iv)}$${toHex(data)}`;
}

async function decryptPassword(env, stored) {
  const key = await passwordKey(env);
  if (!key) throw new HttpError(503, '尚未設定密碼加密金鑰（PASSWORD_KEY）。');
  const [ivHex, dataHex] = String(stored).split('$');
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(ivHex) }, key, fromHex(dataHex));
  return new TextDecoder().decode(data);
}

const sha256 = async (value) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(value)));

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function validatePassword(password, min = 9) {
  if (typeof password !== 'string' || password.length < min || password.length > 128) {
    throw new HttpError(400, `密碼長度需為 ${min} 到 128 個字元。`);
  }
}

function validateUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new HttpError(400, '帳號需為 3 到 40 個英數字，可使用 . _ -');
  }
}

// ---------- 驗證輸入 ----------

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
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

// schoolNames：目前設定的學校名稱（地點與參與學校只接受這些）
function normalizeEvent(body, schoolNames) {
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
  if (location && location !== ONLINE_LOCATION && !schoolNames.includes(location)) throw new HttpError(400, '地點不正確。');
  return {
    title,
    category: body.category,
    startDate: body.startDate,
    endDate,
    time,
    location,
    owner: optionalString(body.owner, 80, '主辦'),
    notes: optionalString(body.notes, 500, '備註'),
    schools: Array.isArray(body.schools) ? schoolNames.filter((s) => body.schools.includes(s)) : [],
  };
}

function requiredString(value, max, label) {
  const s = optionalString(value, max, label);
  if (!s) throw new HttpError(400, `請填寫${label}。`);
  return s;
}

function invalid(message) {
  throw new HttpError(400, message);
}

function intInRange(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label}需為 ${min} 到 ${max} 的整數。`);
  return n;
}

function normalizeObservation(body) {
  if (!isValidDate(body.date)) throw new HttpError(400, '請選擇有效的日期。');
  const modes = Array.isArray(body.modes) ? AI_MODES.filter((m) => body.modes.includes(m)) : [];
  if (!modes.length) throw new HttpError(400, '請至少勾選一項 AI 教學應用模式。');
  return {
    date: body.date,
    subject: requiredString(body.subject, 40, '領域/科目'),
    designer: requiredString(body.designer, 80, '設計者'),
    grade: GRADES.includes(Number(body.grade)) ? Number(body.grade) : invalid('請選擇年級（七～十二年級）。'),
    className: requiredString(body.className, 20, '班級'),
    students: intInRange(body.students, 1, 200, '人數'),
    periods: intInRange(body.periods, 1, 30, '總節數'),
    minutes: intInRange(body.minutes, 1, 180, '每節分鐘數'),
    unit: requiredString(body.unit, 120, '單元名稱'),
    modes,
  };
}

// ---------- 資料轉換 ----------

function canDeleteEvent(row, session) {
  if (!session) return false;
  if (session.role === 'owner') return true;
  return row.created_by_member_id === session.member.id;
}

function toEvent(row, session) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    startDate: row.start_date,
    endDate: row.end_date || '',
    time: row.time || '',
    location: row.location || '',
    owner: row.owner || '',
    notes: row.notes || '',
    schools: JSON.parse(row.schools || '[]'),
    createdBySchool: row.created_by_school || null,
    completedAt: row.completed_at || null,
    deletedAt: row.deleted_at || null,
    canDelete: canDeleteEvent(row, session),
  };
}

// 未登入者看到的姓名：保留頭尾字，中間打碼（王小明 → 王○明、王明 → 王○）；多位設計者分別處理
function maskName(name) {
  return name.replace(/[^\s、,，/／&＆]+/g, (part) => {
    const chars = Array.from(part);
    if (chars.length === 1) return part;
    if (chars.length === 2) return `${chars[0]}○`;
    return chars[0] + '○'.repeat(chars.length - 2) + chars[chars.length - 1];
  });
}

// files：這筆觀課的附件；未登入者只看得到數量
function toObservation(row, session, files = []) {
  return {
    fileCount: files.length,
    files: session ? files.map(toFile) : [],
    id: row.id,
    date: row.date,
    subject: row.subject,
    designer: session ? row.designer : maskName(row.designer),
    grade: row.grade,
    className: row.class_name,
    students: row.students,
    periods: row.periods,
    minutes: row.minutes,
    unit: row.unit,
    modes: JSON.parse(row.modes || '[]'),
    createdBySchool: row.created_by_school || null,
    canModify: canDeleteEvent(row, session),
  };
}

const toMember = (row) => ({
  id: row.id,
  schoolName: row.school_name,
  username: row.username,
  passwordViewable: Boolean(row.password_enc),
});

async function findEvent(ctx, id, { deleted = false } = {}) {
  const row = await ctx.db
    .prepare(`SELECT * FROM events WHERE id = ? AND deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'}`)
    .bind(id)
    .first();
  if (!row) throw new HttpError(404, '找不到這筆期程。');
  return row;
}

const actorName = (session) =>
  session?.role === 'school' ? `${session.member.school_name}（${session.member.username}）` : '管理者';

async function audit(ctx, action, detail = '') {
  await ctx.db
    .prepare('INSERT INTO audit_log (at, actor, action, detail) VALUES (?, ?, ?, ?)')
    .bind(new Date().toISOString(), actorName(ctx.session), action, detail)
    .run();
}

// ---------- 管理者帳號 ----------

async function getAdmin(ctx) {
  let admin = await ctx.db.prepare('SELECT * FROM admin WHERE id = 1').first();
  if (admin) return admin;
  const password = ctx.env.ADMIN_PASSWORD;
  if (!password || password.length < 9) {
    throw new HttpError(503, '尚未設定管理者密碼（ADMIN_PASSWORD，至少 9 個字元）。');
  }
  await ctx.db
    .prepare("INSERT OR IGNORE INTO admin (id, username, password_hash) VALUES (1, 'admin', ?)")
    .bind(await hashPassword(password))
    .run();
  return ctx.db.prepare('SELECT * FROM admin WHERE id = 1').first();
}

// ---------- Cookie / 工作階段 ----------

function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(ctx, token, maxAgeSec) {
  const parts = [`${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (ctx.url.protocol === 'https:') parts.push('Secure');
  ctx.setCookie = parts.join('; ');
}

async function createSession(ctx, role, memberId = null) {
  const token = randomToken();
  const now = Date.now();
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    ctx.db
      .prepare('INSERT INTO sessions (id, role, member_id, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256(token), role, memberId, now + SESSION_TTL_MS),
  ]);
  sessionCookie(ctx, token, SESSION_TTL_MS / 1000);
}

async function getSession(ctx) {
  const token = parseCookies(ctx.request)[COOKIE_NAME];
  if (!token) return null;
  const id = await sha256(token);
  const record = await ctx.db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').bind(id, Date.now()).first();
  if (!record) return null;
  if (record.role === 'owner') return { role: 'owner', id };
  const member = await ctx.db.prepare('SELECT * FROM members WHERE id = ?').bind(record.member_id).first();
  return member ? { role: 'school', member, id } : null;
}

function requireOwner(session) {
  if (session?.role !== 'owner') throw new HttpError(403, '需要管理者權限。');
}

function requireEditor(session) {
  if (!session) throw new HttpError(401, '請先登入。');
}

// ---------- 登入次數限制 ----------

async function checkLoginLock(ctx) {
  const row = await ctx.db.prepare('SELECT locked_until FROM login_failures WHERE key = ?').bind(ctx.ip).first();
  if (row && row.locked_until > Date.now()) throw new HttpError(429, '登入失敗次數過多，請 15 分鐘後再試。');
}

async function recordLoginFailure(ctx) {
  await ctx.db
    .prepare(
      `INSERT INTO login_failures (key, count, locked_until) VALUES (?1, 1, 0)
       ON CONFLICT(key) DO UPDATE SET
         locked_until = CASE WHEN count + 1 >= 5 THEN ?2 ELSE locked_until END,
         count = CASE WHEN count + 1 >= 5 THEN 0 ELSE count + 1 END`
    )
    .bind(ctx.ip, Date.now() + 15 * 60 * 1000)
    .run();
}

const clearLoginFailures = (ctx) => ctx.db.prepare('DELETE FROM login_failures WHERE key = ?').bind(ctx.ip).run();

// ---------- API 路由 ----------

const routes = [];

// raw：不解析 JSON 內容（例如上傳檔案），由 handler 自行讀取 ctx.request
function route(method, pattern, handler, { raw = false } = {}) {
  const keys = [];
  const re = new RegExp(
    `^${pattern.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '(\\d+)';
    })}$`
  );
  routes.push({ method, re, keys, handler, raw });
}

route('GET', '/api/me', async ({ session, db }) => {
  if (!session) return { role: 'viewer' };
  if (session.role === 'owner') {
    const admin = await db.prepare('SELECT username FROM admin WHERE id = 1').first();
    return { role: 'owner', username: admin?.username || 'admin' };
  }
  return { role: 'school', schoolName: session.member.school_name, username: session.member.username };
});

// 管理者
route('POST', '/api/admin/login', async (ctx) => {
  await checkLoginLock(ctx);
  const admin = await getAdmin(ctx);
  if (ctx.body.username !== admin.username || !(await verifyPassword(ctx.body.password, admin.password_hash))) {
    await recordLoginFailure(ctx);
    throw new HttpError(401, '帳號或密碼錯誤。');
  }
  await clearLoginFailures(ctx);
  await createSession(ctx, 'owner');
  return { ok: true };
});

async function logout(ctx) {
  if (ctx.session) await ctx.db.prepare('DELETE FROM sessions WHERE id = ?').bind(ctx.session.id).run();
  sessionCookie(ctx, '', 0);
  return { ok: true };
}
route('POST', '/api/admin/logout', logout);
route('POST', '/api/schools/logout', logout);

route('GET', '/api/admin/credentials', async (ctx) => {
  requireOwner(ctx.session);
  return { username: (await getAdmin(ctx)).username };
});

route('PUT', '/api/admin/credentials', async (ctx) => {
  requireOwner(ctx.session);
  const admin = await getAdmin(ctx);
  if (!(await verifyPassword(ctx.body.currentPassword, admin.password_hash))) {
    throw new HttpError(400, '目前密碼不正確。');
  }
  validateUsername(ctx.body.username);
  validatePassword(ctx.body.password);
  await ctx.db.batch([
    ctx.db
      .prepare('UPDATE admin SET username = ?, password_hash = ? WHERE id = 1')
      .bind(ctx.body.username, await hashPassword(ctx.body.password)),
    ctx.db.prepare("DELETE FROM sessions WHERE role = 'owner'"),
  ]);
  await audit(ctx, '修改管理者帳號密碼', `帳號：${ctx.body.username}`);
  sessionCookie(ctx, '', 0);
  return { ok: true };
});

route('GET', '/api/admin/audit', async (ctx) => {
  requireOwner(ctx.session);
  const { results } = await ctx.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all();
  return results;
});

// 學校端
route('POST', '/api/schools/login', async (ctx) => {
  await checkLoginLock(ctx);
  const member = await ctx.db
    .prepare('SELECT * FROM members WHERE username = ? COLLATE NOCASE')
    .bind(String(ctx.body.username || ''))
    .first();
  if (!member || !(await verifyPassword(ctx.body.password, member.password_hash))) {
    await recordLoginFailure(ctx);
    throw new HttpError(401, '帳號或密碼錯誤。');
  }
  await clearLoginFailures(ctx);
  await createSession(ctx, 'school', member.id);
  return { ok: true };
});

route('GET', '/api/schools/members', async (ctx) => {
  requireOwner(ctx.session);
  const { results } = await ctx.db.prepare('SELECT * FROM members ORDER BY school_name, username').all();
  return results.map(toMember);
});

route('POST', '/api/schools/members', async (ctx) => {
  requireOwner(ctx.session);
  const schoolName = optionalString(ctx.body.schoolName, 80, '學校名稱');
  if (!schoolName) throw new HttpError(400, '請填寫學校名稱。');
  validateUsername(ctx.body.username);
  validatePassword(ctx.body.password, SCHOOL_PASSWORD_MIN);
  const exists = await ctx.db
    .prepare('SELECT id FROM members WHERE username = ? COLLATE NOCASE')
    .bind(ctx.body.username)
    .first();
  if (exists) throw new HttpError(409, '此帳號已被使用。');
  const row = await ctx.db
    .prepare(
      'INSERT INTO members (school_name, username, password_hash, password_enc, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *'
    )
    .bind(schoolName, ctx.body.username, await hashPassword(ctx.body.password),
      await encryptPassword(ctx.env, ctx.body.password), new Date().toISOString())
    .first();
  await audit(ctx, '建立學校帳號', `${schoolName}（${row.username}）`);
  return toMember(row);
});

async function findMember(ctx) {
  const member = await ctx.db.prepare('SELECT * FROM members WHERE id = ?').bind(ctx.params.id).first();
  if (!member) throw new HttpError(404, '找不到這個帳號。');
  return member;
}

route('GET', '/api/schools/members/:id/password', async (ctx) => {
  requireOwner(ctx.session);
  const member = await findMember(ctx);
  if (!member.password_enc) {
    throw new HttpError(404, '這個帳號的密碼是在加入查看功能前設定的，無法顯示；重設密碼後即可查看。');
  }
  const password = await decryptPassword(ctx.env, member.password_enc);
  await audit(ctx, '查看學校密碼', `${member.school_name}（${member.username}）`);
  return { password };
});

// 修改學校帳號：學校名稱、帳號、密碼皆可改，未提供的欄位不變
route('PATCH', '/api/schools/members/:id', async (ctx) => {
  requireOwner(ctx.session);
  const member = await findMember(ctx);
  const changes = [];

  let schoolName = member.school_name;
  if (ctx.body.schoolName !== undefined) {
    schoolName = optionalString(ctx.body.schoolName, 80, '學校名稱');
    if (!schoolName) throw new HttpError(400, '請填寫學校名稱。');
    if (schoolName !== member.school_name) changes.push(`學校名稱 ${member.school_name} → ${schoolName}`);
  }

  let username = member.username;
  if (ctx.body.username !== undefined && ctx.body.username !== member.username) {
    validateUsername(ctx.body.username);
    const exists = await ctx.db
      .prepare('SELECT id FROM members WHERE username = ? COLLATE NOCASE AND id != ?')
      .bind(ctx.body.username, member.id)
      .first();
    if (exists) throw new HttpError(409, '此帳號已被使用。');
    username = ctx.body.username;
    changes.push(`帳號 ${member.username} → ${username}`);
  }

  let passwordHash = member.password_hash;
  let passwordEnc = member.password_enc;
  if (ctx.body.password) {
    validatePassword(ctx.body.password, SCHOOL_PASSWORD_MIN);
    passwordHash = await hashPassword(ctx.body.password);
    passwordEnc = await encryptPassword(ctx.env, ctx.body.password);
    changes.push('重設密碼');
  }

  if (!changes.length) return toMember(member);
  const statements = [
    ctx.db
      .prepare('UPDATE members SET school_name = ?, username = ?, password_hash = ?, password_enc = ? WHERE id = ?')
      .bind(schoolName, username, passwordHash, passwordEnc, member.id),
  ];
  // 帳號或密碼變更後，原有登入失效
  if (username !== member.username || ctx.body.password) {
    statements.push(ctx.db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(member.id));
  }
  await ctx.db.batch(statements);
  await audit(ctx, '修改學校帳號', `${member.school_name}（${member.username}）：${changes.join('、')}`);
  return toMember({ ...member, school_name: schoolName, username, password_enc: passwordEnc });
});

route('DELETE', '/api/schools/members/:id', async (ctx) => {
  requireOwner(ctx.session);
  const member = await findMember(ctx);
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(member.id),
    ctx.db.prepare('DELETE FROM members WHERE id = ?').bind(member.id),
  ]);
  await audit(ctx, '移除學校帳號', `${member.school_name}（${member.username}）`);
  return { ok: true };
});

// 期程
route('GET', '/api/events', async (ctx) => {
  const { results } = await ctx.db
    .prepare('SELECT * FROM events WHERE deleted_at IS NULL ORDER BY start_date, time, id')
    .all();
  return results.map((r) => toEvent(r, ctx.session));
});

route('GET', '/api/events/trash', async (ctx) => {
  requireEditor(ctx.session);
  const stmt =
    ctx.session.role === 'owner'
      ? ctx.db.prepare('SELECT * FROM events WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      : ctx.db
          .prepare('SELECT * FROM events WHERE deleted_at IS NOT NULL AND created_by_member_id = ? ORDER BY deleted_at DESC')
          .bind(ctx.session.member.id);
  const { results } = await stmt.all();
  return results.map((r) => toEvent(r, ctx.session));
});

route('POST', '/api/events', async (ctx) => {
  requireEditor(ctx.session);
  const e = normalizeEvent(ctx.body, await schoolNames(ctx));
  const school = ctx.session.role === 'school' ? ctx.session.member : null;
  const row = await ctx.db
    .prepare(
      `INSERT INTO events (title, category, start_date, end_date, time, location, owner, notes, schools,
         created_by_school, created_by_member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(e.title, e.category, e.startDate, e.endDate, e.time, e.location, e.owner, e.notes, JSON.stringify(e.schools),
      school?.school_name ?? null, school?.id ?? null, new Date().toISOString())
    .first();
  await audit(ctx, '新增期程', `${e.category}｜${e.title}（${e.startDate}）`);
  return toEvent(row, ctx.session);
});

route('PUT', '/api/events/:id', async (ctx) => {
  requireOwner(ctx.session);
  const before = await findEvent(ctx, ctx.params.id);
  const e = normalizeEvent(ctx.body, await schoolNames(ctx));
  const row = await ctx.db
    .prepare(
      `UPDATE events SET title = ?, category = ?, start_date = ?, end_date = ?, time = ?, location = ?,
         owner = ?, notes = ?, schools = ?, updated_at = ? WHERE id = ? RETURNING *`
    )
    .bind(e.title, e.category, e.startDate, e.endDate, e.time, e.location, e.owner, e.notes,
      JSON.stringify(e.schools), new Date().toISOString(), before.id)
    .first();
  const moved = before.start_date !== e.startDate ? `，日期 ${before.start_date} → ${e.startDate}` : '';
  await audit(ctx, '編輯期程', `${e.title}${moved}`);
  return toEvent(row, ctx.session);
});

route('PATCH', '/api/events/:id', async (ctx) => {
  requireOwner(ctx.session);
  if (typeof ctx.body.completed !== 'boolean') throw new HttpError(400, '請提供完成狀態。');
  const event = await findEvent(ctx, ctx.params.id);
  const row = await ctx.db
    .prepare('UPDATE events SET completed_at = ? WHERE id = ? RETURNING *')
    .bind(ctx.body.completed ? new Date().toISOString() : null, event.id)
    .first();
  await audit(ctx, ctx.body.completed ? '確認完成' : '取消完成', event.title);
  return toEvent(row, ctx.session);
});

route('DELETE', '/api/events/:id', async (ctx) => {
  requireEditor(ctx.session);
  if (ctx.body.confirmation !== '確定刪除') throw new HttpError(400, '請輸入「確定刪除」。');
  const event = await findEvent(ctx, ctx.params.id);
  if (!canDeleteEvent(event, ctx.session)) throw new HttpError(403, '只能刪除自己新增的項目。');
  await ctx.db.prepare('UPDATE events SET deleted_at = ? WHERE id = ?').bind(new Date().toISOString(), event.id).run();
  await audit(ctx, '刪除期程（移至回收區）', event.title);
  return { ok: true };
});

route('POST', '/api/events/:id/restore', async (ctx) => {
  requireEditor(ctx.session);
  if (ctx.body.confirmation !== '確定復原') throw new HttpError(400, '請輸入「確定復原」。');
  const event = await findEvent(ctx, ctx.params.id, { deleted: true });
  if (!canDeleteEvent(event, ctx.session)) throw new HttpError(403, '只能復原自己新增的項目。');
  const row = await ctx.db.prepare('UPDATE events SET deleted_at = NULL WHERE id = ? RETURNING *').bind(event.id).first();
  await audit(ctx, '復原期程', event.title);
  return toEvent(row, ctx.session);
});

// 公開觀課
async function findObservation(ctx) {
  const row = await ctx.db
    .prepare('SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL')
    .bind(ctx.params.id)
    .first();
  if (!row) throw new HttpError(404, '找不到這筆觀課資料。');
  if (!canDeleteEvent(row, ctx.session)) throw new HttpError(403, '只能修改自己填報的資料。');
  return row;
}

const observationLabel = (o) => `${o.subject}｜${o.unit}（${o.date}）`;

// 觀課 → 期程清單的「觀課計畫」。期程是公開的，所以不放設計者姓名。
const GRADE_LABELS = { 7: '七年級', 8: '八年級', 9: '九年級', 10: '十年級', 11: '十一年級', 12: '十二年級' };
function observationEvent(o, schoolName, names = []) {
  return {
    title: `公開觀課｜${o.subject}｜${o.unit}`.slice(0, 120),
    date: o.date,
    location: names.includes(schoolName) ? schoolName : '',
    owner: schoolName || '',
    schools: names.includes(schoolName) ? [schoolName] : [],
    notes: `${GRADE_LABELS[o.grade] || ''} ${o.className} 班 · 共 ${o.periods} 節，每節 ${o.minutes} 分鐘\n（由公開觀課填報自動建立）`,
  };
}

async function insertObservationEvent(ctx, observationId, o, school) {
  const e = observationEvent(o, school?.school_name, await schoolNames(ctx));
  return ctx.db
    .prepare(
      `INSERT INTO events (title, category, start_date, end_date, time, location, owner, notes, schools,
         created_by_school, created_by_member_id, created_at, observation_id)
       VALUES (?, '觀課計畫', ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(e.title, e.date, e.location, e.owner, e.notes, JSON.stringify(e.schools), school?.school_name ?? null,
      school?.id ?? null, new Date().toISOString(), observationId);
}

route('GET', '/api/observations', async (ctx) => {
  const [{ results }, files] = await Promise.all([
    ctx.db.prepare('SELECT * FROM observations WHERE deleted_at IS NULL ORDER BY date, id').all(),
    ctx.db.prepare('SELECT id, observation_id, name, content_type, size FROM observation_files ORDER BY id').all(),
  ]);
  const byObs = new Map();
  for (const f of files.results) {
    if (!byObs.has(f.observation_id)) byObs.set(f.observation_id, []);
    byObs.get(f.observation_id).push(f);
  }
  return results.map((r) => toObservation(r, ctx.session, byObs.get(r.id) || []));
});

route('POST', '/api/observations', async (ctx) => {
  requireEditor(ctx.session);
  const o = normalizeObservation(ctx.body);
  const school = ctx.session.role === 'school' ? ctx.session.member : null;
  const row = await ctx.db
    .prepare(
      `INSERT INTO observations (date, subject, designer, grade, class_name, students, periods, minutes, unit, modes,
         created_by_school, created_by_member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(o.date, o.subject, o.designer, o.grade, o.className, o.students, o.periods, o.minutes, o.unit,
      JSON.stringify(o.modes), school?.school_name ?? null, school?.id ?? null, new Date().toISOString())
    .first();
  await (await insertObservationEvent(ctx, row.id, o, school)).run();
  await audit(ctx, '填報公開觀課', observationLabel(o));
  return toObservation(row, ctx.session, []);
});

route('PUT', '/api/observations/:id', async (ctx) => {
  requireEditor(ctx.session);
  const before = await findObservation(ctx);
  const o = normalizeObservation(ctx.body);
  const row = await ctx.db
    .prepare(
      `UPDATE observations SET date = ?, subject = ?, designer = ?, grade = ?, class_name = ?, students = ?,
         periods = ?, minutes = ?, unit = ?, modes = ?, updated_at = ? WHERE id = ? RETURNING *`
    )
    .bind(o.date, o.subject, o.designer, o.grade, o.className, o.students, o.periods, o.minutes, o.unit,
      JSON.stringify(o.modes), new Date().toISOString(), before.id)
    .first();

  // 同步期程：已有對應期程就更新（使用者刪掉的不再建回）；早於此功能的舊紀錄則補建
  const linked = await ctx.db.prepare('SELECT id, deleted_at FROM events WHERE observation_id = ?').bind(before.id).first();
  const school = before.created_by_member_id
    ? { id: before.created_by_member_id, school_name: before.created_by_school }
    : null;
  if (!linked) {
    await (await insertObservationEvent(ctx, before.id, o, school)).run();
  } else if (!linked.deleted_at) {
    const e = observationEvent(o, before.created_by_school);
    await ctx.db
      .prepare('UPDATE events SET title = ?, start_date = ?, notes = ?, updated_at = ? WHERE id = ?')
      .bind(e.title, e.date, e.notes, new Date().toISOString(), linked.id)
      .run();
  }

  const { results: files } = await ctx.db
    .prepare('SELECT id, observation_id, name, content_type, size FROM observation_files WHERE observation_id = ?')
    .bind(before.id)
    .all();
  await audit(ctx, '編輯公開觀課', observationLabel(o));
  return toObservation(row, ctx.session, files);
});

route('DELETE', '/api/observations/:id', async (ctx) => {
  requireEditor(ctx.session);
  if (ctx.body.confirmation !== '確定刪除') throw new HttpError(400, '請輸入「確定刪除」。');
  const row = await findObservation(ctx);
  const now = new Date().toISOString();
  const { results: files } = await ctx.db
    .prepare('SELECT kv_key FROM observation_files WHERE observation_id = ?')
    .bind(row.id)
    .all();
  await ctx.db.batch([
    ctx.db.prepare('UPDATE observations SET deleted_at = ? WHERE id = ?').bind(now, row.id),
    // 對應的期程移到回收區（仍可復原）
    ctx.db.prepare('UPDATE events SET deleted_at = ? WHERE observation_id = ? AND deleted_at IS NULL').bind(now, row.id),
    ctx.db.prepare('DELETE FROM observation_files WHERE observation_id = ?').bind(row.id),
  ]);
  await Promise.all(files.map((f) => ctx.env.FILES.delete(f.kv_key)));
  await audit(ctx, '刪除公開觀課', observationLabel(row));
  return { ok: true };
});

// 觀課附件：只有登入者可下載；只有填報者（或管理者）可上傳、刪除
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_OBSERVATION = 10;
const FILE_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
};
const INLINE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const toFile = (f) => ({ id: f.id, name: f.name, size: f.size, type: f.content_type });

route(
  'POST',
  '/api/observations/:id/files',
  async (ctx) => {
    requireEditor(ctx.session);
    const obs = await findObservation(ctx);
    let name;
    try {
      name = decodeURIComponent(ctx.request.headers.get('X-File-Name') || '');
    } catch {
      throw new HttpError(400, '檔名格式錯誤。');
    }
    name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(-120);
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const type = FILE_TYPES[ext];
    if (!name || !type) throw new HttpError(400, '只接受 PDF、圖片（JPG、PNG、WebP）與 Office 文件。');
    const declared = Number(ctx.request.headers.get('Content-Length') || 0);
    if (declared > MAX_FILE_BYTES) throw new HttpError(413, '檔案不可超過 10 MB。');
    const { count } = await ctx.db
      .prepare('SELECT COUNT(*) AS count FROM observation_files WHERE observation_id = ?')
      .bind(obs.id)
      .first();
    if (count >= MAX_FILES_PER_OBSERVATION) throw new HttpError(400, `每筆觀課最多 ${MAX_FILES_PER_OBSERVATION} 個附件。`);
    const data = await ctx.request.arrayBuffer();
    if (!data.byteLength) throw new HttpError(400, '檔案是空的。');
    if (data.byteLength > MAX_FILE_BYTES) throw new HttpError(413, '檔案不可超過 10 MB。');

    const key = `obs/${obs.id}/${randomToken()}`;
    await ctx.env.FILES.put(key, data);
    const school = ctx.session.role === 'school' ? ctx.session.member : null;
    const row = await ctx.db
      .prepare(
        `INSERT INTO observation_files (observation_id, name, content_type, size, kv_key, created_by_school,
           created_by_member_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .bind(obs.id, name, type, data.byteLength, key, school?.school_name ?? null, school?.id ?? null, new Date().toISOString())
      .first();
    await audit(ctx, '上傳觀課附件', `${observationLabel(obs)}：${name}`);
    return toFile(row);
  },
  { raw: true }
);

async function findFile(ctx) {
  const file = await ctx.db.prepare('SELECT * FROM observation_files WHERE id = ?').bind(ctx.params.id).first();
  if (!file) throw new HttpError(404, '找不到這個附件。');
  return file;
}

route('GET', '/api/observation-files/:id', async (ctx) => {
  requireEditor(ctx.session);
  const file = await findFile(ctx);
  const body = await ctx.env.FILES.get(file.kv_key, { type: 'stream' });
  if (!body) throw new HttpError(404, '找不到這個附件的內容。');
  const disposition = INLINE_TYPES.has(file.content_type) ? 'inline' : 'attachment';
  return new Response(body, {
    headers: {
      'Content-Type': file.content_type,
      'Content-Length': String(file.size),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Cache-Control': 'private, no-store',
    },
  });
});

route('DELETE', '/api/observation-files/:id', async (ctx) => {
  requireEditor(ctx.session);
  const file = await findFile(ctx);
  ctx.params.id = file.observation_id;
  const obs = await findObservation(ctx); // 檢查是否為填報者
  await ctx.db.prepare('DELETE FROM observation_files WHERE id = ?').bind(file.id).run();
  await ctx.env.FILES.delete(file.kv_key);
  await audit(ctx, '刪除觀課附件', `${observationLabel(obs)}：${file.name}`);
  return { ok: true };
});

// 學校與縣市（管理者維護；全站的學校選項都從這裡讀取）
const countyRank = (c) => (TEAM_COUNTIES.includes(c) ? TEAM_COUNTIES.indexOf(c) : TEAM_COUNTIES.length);
const toSchool = (r) => ({ id: r.id, name: r.name, county: r.county });

// 同一個請求內只查一次
async function getSchools(ctx) {
  if (!ctx.schools) {
    const { results } = await ctx.db.prepare('SELECT * FROM schools ORDER BY sort_order, id').all();
    ctx.schools = results.sort((a, b) => countyRank(a.county) - countyRank(b.county));
  }
  return ctx.schools;
}
const schoolNames = async (ctx) => (await getSchools(ctx)).map((s) => s.name);

function normalizeSchool(body) {
  const name = requiredString(body.name, 40, '學校名稱');
  if (!TEAM_COUNTIES.includes(body.county)) throw new HttpError(400, '請選擇縣市（雲林縣或嘉義縣）。');
  return { name, county: body.county };
}

async function assertSchoolNameFree(ctx, name, excludeId = 0) {
  const norm = (v) => String(v).replace(/\s+/g, '');
  if ((await getSchools(ctx)).some((s) => s.id !== excludeId && norm(s.name) === norm(name))) {
    throw new HttpError(409, `「${name}」已在學校清單中。`);
  }
}

async function findSchool(ctx) {
  const row = await ctx.db.prepare('SELECT * FROM schools WHERE id = ?').bind(ctx.params.id).first();
  if (!row) throw new HttpError(404, '找不到這所學校。');
  return row;
}

route('GET', '/api/schools', async (ctx) => (await getSchools(ctx)).map(toSchool));

route('POST', '/api/schools', async (ctx) => {
  requireOwner(ctx.session);
  const s = normalizeSchool(ctx.body);
  await assertSchoolNameFree(ctx, s.name);
  const row = await ctx.db
    .prepare(
      `INSERT INTO schools (name, county, sort_order, created_at)
       VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM schools), ?) RETURNING *`
    )
    .bind(s.name, s.county, new Date().toISOString())
    .first();
  await audit(ctx, '新增學校', `${s.name}（${s.county}）`);
  return toSchool(row);
});

// 改名時一併更新期程的地點、參與學校與計畫成員的服務學校
route('PUT', '/api/schools/:id', async (ctx) => {
  requireOwner(ctx.session);
  const before = await findSchool(ctx);
  const s = normalizeSchool(ctx.body);
  await assertSchoolNameFree(ctx, s.name, before.id);
  const statements = [ctx.db.prepare('UPDATE schools SET name = ?, county = ? WHERE id = ?').bind(s.name, s.county, before.id)];
  if (s.name !== before.name) {
    const oldJson = JSON.stringify(before.name);
    const newJson = JSON.stringify(s.name);
    statements.push(
      ctx.db.prepare('UPDATE events SET location = ? WHERE location = ?').bind(s.name, before.name),
      ctx.db.prepare('UPDATE events SET schools = REPLACE(schools, ?, ?) WHERE schools LIKE ?').bind(oldJson, newJson, `%${oldJson}%`),
      ctx.db.prepare('UPDATE team_members SET school = ? WHERE school = ?').bind(s.name, before.name),
      // 學校帳號以名稱對應學校
      ctx.db.prepare('UPDATE members SET school_name = ? WHERE school_name = ?').bind(s.name, before.name)
    );
  }
  // 計畫成員的縣市跟著學校
  statements.push(ctx.db.prepare('UPDATE team_members SET county = ? WHERE school = ?').bind(s.county, s.name));
  await ctx.db.batch(statements);
  const changes = [
    s.name !== before.name && `名稱 ${before.name} → ${s.name}`,
    s.county !== before.county && `縣市 ${before.county} → ${s.county}`,
  ].filter(Boolean);
  await audit(ctx, '修改學校', changes.join('、') || s.name);
  return toSchool({ ...before, ...s });
});

// 刪除只移出清單；既有期程與名單上的學校名稱保留不動
route('DELETE', '/api/schools/:id', async (ctx) => {
  requireOwner(ctx.session);
  const row = await findSchool(ctx);
  await ctx.db.prepare('DELETE FROM schools WHERE id = ?').bind(row.id).run();
  await audit(ctx, '刪除學校', `${row.name}（${row.county}）`);
  return { ok: true };
});

// 計畫成員
const toTeamMember = (row, session) => ({
  id: row.id,
  role: row.role,
  name: session ? row.name : maskName(row.name),
  title: row.title || '',
  school: row.school || '',
  county: row.county || '',
  createdBySchool: row.created_by_school || null,
  canModify: canDeleteEvent(row, session),
});

// 服務學校在學校清單中時，縣市一律以學校設定為準（避免填錯）；清單外的單位才看使用者選的縣市
async function normalizeTeamMember(ctx, body) {
  if (!TEAM_ROLES.includes(body.role)) throw new HttpError(400, '名單類別不正確。');
  if (!TEAM_TITLES.includes(body.title)) throw new HttpError(400, '請選擇身分（校長、主任、組長、教師、職員）。');
  const school = requiredString(body.school, 40, '服務學校');
  const known = (await getSchools(ctx)).find((s) => s.name === school);
  const county = known ? known.county : body.county;
  if (!TEAM_COUNTIES.includes(county)) throw new HttpError(400, '請選擇縣市（雲林縣或嘉義縣）。');
  return { role: body.role, title: body.title, name: requiredString(body.name, 40, '姓名'), school, county };
}

// deleted：true 時找回收區裡的名單
async function findTeamMember(ctx, { deleted = false } = {}) {
  const row = await ctx.db
    .prepare(`SELECT * FROM team_members WHERE id = ? AND deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'}`)
    .bind(ctx.params.id)
    .first();
  if (!row) throw new HttpError(404, '找不到這筆名單。');
  if (!canDeleteEvent(row, ctx.session)) throw new HttpError(403, '只能修改自己新增的名單。');
  return row;
}

// 同一份名單：同名同校直接擋下；同名不同校需使用者確認（confirmDuplicate）。比對時忽略空白。
// before：編輯前的資料；姓名與名單都沒變時不再詢問同名不同校
async function checkDuplicate(ctx, p, excludeId = 0, before = null) {
  const norm = (v) => String(v || '').replace(/\s+/g, '');
  const { results } = await ctx.db
    .prepare('SELECT name, school FROM team_members WHERE role = ? AND deleted_at IS NULL AND id != ?')
    .bind(p.role, excludeId)
    .all();
  const sameName = results.filter((r) => norm(r.name) === norm(p.name));
  if (!sameName.length) return;
  if (sameName.some((r) => norm(r.school) === norm(p.school))) {
    throw new HttpError(409, `「${p.name}」（${p.school}）已在${p.role}名單中，不需要重複加入。`);
  }
  const unchanged = before && norm(before.name) === norm(p.name) && before.role === p.role;
  if (!ctx.body.confirmDuplicate && !unchanged) {
    const schools = [...new Set(sameName.map((r) => r.school || '未填服務學校'))].join('、');
    throw new HttpError(409, `${p.role}名單中已有同名的「${p.name}」（${schools}）。若是不同的人，請再按一次確認加入。`, {
      duplicate: true,
    });
  }
}

route('GET', '/api/team', async (ctx) => {
  const { results } = await ctx.db.prepare('SELECT * FROM team_members WHERE deleted_at IS NULL ORDER BY id').all();
  return results.map((r) => toTeamMember(r, ctx.session));
});

// 回收區：管理者看全部，學校端只看自己刪除（新增）的
route('GET', '/api/team/trash', async (ctx) => {
  requireEditor(ctx.session);
  const stmt =
    ctx.session.role === 'owner'
      ? ctx.db.prepare('SELECT * FROM team_members WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      : ctx.db
          .prepare('SELECT * FROM team_members WHERE deleted_at IS NOT NULL AND created_by_member_id = ? ORDER BY deleted_at DESC')
          .bind(ctx.session.member.id);
  const { results } = await stmt.all();
  return results.map((r) => ({ ...toTeamMember(r, ctx.session), deletedAt: r.deleted_at }));
});

route('POST', '/api/team/:id/restore', async (ctx) => {
  requireEditor(ctx.session);
  const row = await findTeamMember(ctx, { deleted: true });
  // 名單上已有同名同校的人就不復原（同名不同校則允許）
  await checkDuplicate({ ...ctx, body: { confirmDuplicate: true } }, row, row.id);
  const restored = await ctx.db
    .prepare('UPDATE team_members SET deleted_at = NULL WHERE id = ? RETURNING *')
    .bind(row.id)
    .first();
  await audit(ctx, `復原${row.role}`, row.name);
  return toTeamMember(restored, ctx.session);
});

route('POST', '/api/team', async (ctx) => {
  requireEditor(ctx.session);
  const p = await normalizeTeamMember(ctx, ctx.body);
  await checkDuplicate(ctx, p);
  const school = ctx.session.role === 'school' ? ctx.session.member : null;
  const row = await ctx.db
    .prepare(
      `INSERT INTO team_members (role, name, title, school, county, created_by_school, created_by_member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(p.role, p.name, p.title, p.school, p.county, school?.school_name ?? null, school?.id ?? null, new Date().toISOString())
    .first();
  await audit(ctx, `新增${p.role}`, `${p.name}（${p.county}，${p.title}，${p.school}）`);
  return toTeamMember(row, ctx.session);
});

route('PUT', '/api/team/:id', async (ctx) => {
  requireEditor(ctx.session);
  const before = await findTeamMember(ctx);
  const p = await normalizeTeamMember(ctx, ctx.body);
  await checkDuplicate(ctx, p, before.id, before);
  const row = await ctx.db
    .prepare('UPDATE team_members SET role = ?, name = ?, title = ?, school = ?, county = ? WHERE id = ? RETURNING *')
    .bind(p.role, p.name, p.title, p.school, p.county, before.id)
    .first();
  const moved = before.role !== p.role ? `，${before.role} → ${p.role}` : '';
  await audit(ctx, '編輯計畫成員', `${before.name} → ${p.name}（${p.county}，${p.title}，${p.school}）${moved}`);
  return toTeamMember(row, ctx.session);
});

route('DELETE', '/api/team/:id', async (ctx) => {
  requireEditor(ctx.session);
  const row = await findTeamMember(ctx);
  await ctx.db.prepare('UPDATE team_members SET deleted_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
  await audit(ctx, `刪除${row.role}（移至回收區）`, row.name);
  return { ok: true };
});

// ---------- 請求處理 ----------

const LOGIN_PAGES = {
  '/admin/login': { role: 'admin', title: '管理者登入', desc: '使用管理者帳號密碼管理期程與學校端權限。', username: 'admin' },
  '/school/login': { role: 'school', title: '學校端登入', desc: '使用管理者提供的帳號與密碼。', username: '' },
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 64 * 1024) throw new HttpError(413, '資料過大。');
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new HttpError(400, '資料格式錯誤。');
  }
}

async function handleApi(ctx) {
  const match = routes
    .filter((r) => r.method === ctx.request.method)
    .map((r) => ({ r, m: r.re.exec(ctx.url.pathname) }))
    .find((x) => x.m);
  if (!match) return json(404, { error: '找不到 API。' });
  try {
    ctx.params = {};
    match.r.keys.forEach((k, i) => (ctx.params[k] = Number(match.m[i + 1])));
    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(ctx.request.method) && !match.r.raw;
    ctx.body = hasBody ? await readBody(ctx.request) : {};
    ctx.session = await getSession(ctx);
    // handler 可直接回傳 Response（例如下載檔案），否則包成 JSON
    const result = await match.r.handler(ctx);
    const res = result instanceof Response ? result : json(200, result);
    if (ctx.setCookie) res.headers.append('Set-Cookie', ctx.setCookie);
    return res;
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { ...err.extra, error: err.message });
    console.error(err);
    return json(500, { error: '伺服器發生錯誤，請稍後重試。' });
  }
}

async function handlePage(ctx) {
  const { request, url, env } = ctx;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
  const assetUrl = (p) => new Request(new URL(p, url), request);

  if (url.pathname === '/') return env.ASSETS.fetch(assetUrl('/index.html'));
  if (url.pathname === '/observations') return env.ASSETS.fetch(assetUrl('/observations.html'));
  if (url.pathname === '/team') return env.ASSETS.fetch(assetUrl('/team.html'));
  if (url.pathname === '/completed') return env.ASSETS.fetch(assetUrl('/completed.html'));

  const login = LOGIN_PAGES[url.pathname];
  if (login) {
    const session = await getSession(ctx);
    if (session && (session.role === 'owner') === (login.role === 'admin')) {
      const next = url.searchParams.get('next');
      const location = next && /^\/[\w-]*$/.test(next) ? next : '/';
      return new Response(null, { status: 302, headers: { Location: location } });
    }
    const template = await (await env.ASSETS.fetch(assetUrl('/login.html'))).text();
    const html = template
      .replaceAll('{{ROLE}}', login.role)
      .replaceAll('{{TITLE}}', escapeHtml(login.title))
      .replaceAll('{{DESC}}', escapeHtml(login.desc))
      .replaceAll('{{USERNAME}}', escapeHtml(login.username));
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }

  if (/^\/[\w-]+\.(css|js|svg)$/.test(url.pathname)) return env.ASSETS.fetch(request);
  return new Response('找不到頁面', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ctx = {
      request,
      env,
      url,
      db: env.DB,
      ip: request.headers.get('CF-Connecting-IP') || 'local',
    };
    const res = url.pathname.startsWith('/api/') ? await handleApi(ctx) : await handlePage(ctx);

    const out = new Response(res.body, res);
    out.headers.set('X-Content-Type-Options', 'nosniff');
    out.headers.set('Referrer-Policy', 'same-origin');
    out.headers.set('X-Frame-Options', 'DENY');
    out.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'"
    );
    return out;
  },
};
