import { B, pw } from './helpers.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log('FAIL', m)));
const req = async (p, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });
  const sc = r.headers.get('set-cookie');
  return { status: r.status, data: await r.json().catch(() => null), cookie: sc && sc.split(';')[0] };
};
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/me'); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

const ac = (await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: pw } })).cookie;
const u = 'mt' + Date.now().toString(36);
const created = await req('/api/schools/members', { method: 'POST', body: { schoolName: '甲國中', username: u, password: 'abc123' }, cookie: ac });
ok(created.status === 200 && created.data.passwordViewable === true, 'create viewable');
const id = created.data.id;

const seen = await req(`/api/schools/members/${id}/password`, { cookie: ac });
ok(seen.status === 200 && seen.data.password === 'abc123', 'admin sees password');

// 非管理者不能看
const sc = (await req('/api/schools/login', { method: 'POST', body: { username: u, password: 'abc123' } })).cookie;
ok((await req(`/api/schools/members/${id}/password`, { cookie: sc })).status === 403, 'school cannot view');
ok((await req(`/api/schools/members/${id}/password`)).status === 403, 'anon cannot view');
ok((await req('/api/schools/members')).status === 403, 'anon cannot list');

// 只改學校名稱：登入不失效
const r1 = await req(`/api/schools/members/${id}`, { method: 'PATCH', body: { schoolName: '乙國中', username: u }, cookie: ac });
ok(r1.status === 200 && r1.data.schoolName === '乙國中', 'rename school');
ok((await req('/api/me', { cookie: sc })).data.schoolName === '乙國中', 'session kept after rename');

// 改帳號 + 密碼：登入失效、新帳密可登入
const u2 = u + 'x';
const r2 = await req(`/api/schools/members/${id}`, { method: 'PATCH', body: { schoolName: '乙國中', username: u2, password: 'newpw9' }, cookie: ac });
ok(r2.status === 200 && r2.data.username === u2, 'change username+pw');
ok((await req('/api/me', { cookie: sc })).data.role === 'viewer', 'old session invalidated');
ok((await req('/api/schools/login', { method: 'POST', body: { username: u2, password: 'newpw9' } })).status === 200, 'login with new creds');
ok((await req(`/api/schools/members/${id}/password`, { cookie: ac })).data.password === 'newpw9', 'view new password');

// 驗證
ok((await req(`/api/schools/members/${id}`, { method: 'PATCH', body: { password: '12345' }, cookie: ac })).status === 400, 'short pw rejected');
ok((await req(`/api/schools/members/${id}`, { method: 'PATCH', body: { schoolName: '' }, cookie: ac })).status === 400, 'empty school rejected');
const other = await req('/api/schools/members', { method: 'POST', body: { schoolName: '丙', username: u + 'o', password: 'abc123' }, cookie: ac });
ok((await req(`/api/schools/members/${id}`, { method: 'PATCH', body: { username: (u + 'O').toUpperCase() }, cookie: ac })).status === 409, 'duplicate username rejected');

// 舊帳號（沒有加密副本）
const audit = (await req('/api/admin/audit', { cookie: ac })).data.slice(0, 8).map((a) => a.action);
ok(audit.includes('查看學校密碼') && audit.includes('修改學校帳號'), 'audit: ' + audit);
ok(!JSON.stringify((await req('/api/admin/audit', { cookie: ac })).data).includes('newpw9'), 'password not in audit');

await req(`/api/schools/members/${id}`, { method: 'DELETE', cookie: ac });
await req(`/api/schools/members/${other.data.id}`, { method: 'DELETE', cookie: ac });
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
