import { B, pw } from './helpers.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log('FAIL', m)));
const req = async (p, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });
  const sc = r.headers.get('set-cookie');
  return { status: r.status, data: await r.json().catch(() => null), cookie: sc && sc.split(';')[0] };
};
for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/me'); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

const ac = (await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: pw } })).cookie;
const mk = async (name) => {
  const m = await req('/api/schools/members', { method: 'POST', body: { schoolName: name, username: 'tr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), password: 'abc123' }, cookie: ac });
  const c = (await req('/api/schools/login', { method: 'POST', body: { username: m.data.username, password: 'abc123' } })).cookie;
  return { m, c };
};
const A = await mk('石榴國中');
const Bs = await mk('東榮國中');
const add = (cookie, extra) => req('/api/team', { method: 'POST', body: { role: '協同主持人', county: '雲林縣', title: '教師', name: '甲', school: '石榴國中', ...extra }, cookie });

const pa = await add(A.c, { name: '回收測試甲' });
const pb = await add(Bs.c, { name: '回收測試乙', school: '東榮國中' });
const padm = await add(ac, { name: '回收測試管' });

ok((await req('/api/team/trash')).status === 401, 'anon trash 401');
ok((await req(`/api/team/${pa.data.id}`, { method: 'DELETE', cookie: A.c })).status === 200, 'school deletes own');
ok((await req(`/api/team/${pb.data.id}`, { method: 'DELETE', cookie: Bs.c })).status === 200, 'other school deletes own');
ok((await req(`/api/team/${padm.data.id}`, { method: 'DELETE', cookie: ac })).status === 200, 'admin deletes');

const list = (await req('/api/team', { cookie: ac })).data;
ok(![pa, pb, padm].some((p) => list.some((x) => x.id === p.data.id)), 'deleted hidden from list');
ok((await req('/api/team')).data.every((x) => ![pa, pb, padm].some((p) => p.data.id === x.id)), 'deleted hidden from public');

const ta = (await req('/api/team/trash', { cookie: A.c })).data;
ok(ta.some((x) => x.id === pa.data.id) && !ta.some((x) => x.id === pb.data.id) && !ta.some((x) => x.id === padm.data.id), 'school sees only own trash');
ok(ta.find((x) => x.id === pa.data.id).deletedAt, 'trash has deletedAt');
const tadm = (await req('/api/team/trash', { cookie: ac })).data;
ok([pa, pb, padm].every((p) => tadm.some((x) => x.id === p.data.id)), 'admin sees all trash');

ok((await req(`/api/team/${pb.data.id}/restore`, { method: 'POST', cookie: A.c })).status === 403, 'school cannot restore others');
ok((await req(`/api/team/${pa.data.id}`, { method: 'PUT', body: { role: '協同主持人', county: '雲林縣', title: '教師', name: 'x', school: 'y' }, cookie: A.c })).status === 404, 'cannot edit trashed');
ok((await req(`/api/team/${pa.data.id}`, { method: 'DELETE', cookie: A.c })).status === 404, 'cannot delete twice');
const r1 = await req(`/api/team/${pa.data.id}/restore`, { method: 'POST', cookie: A.c });
ok(r1.status === 200 && r1.data.name === '回收測試甲' && r1.data.county === '雲林縣', 'school restores own');
ok((await req(`/api/team/${pa.data.id}/restore`, { method: 'POST', cookie: A.c })).status === 404, 'restore twice 404');
ok((await req('/api/team', { cookie: A.c })).data.some((x) => x.id === pa.data.id), 'restored back in list');
ok((await req(`/api/team/${pb.data.id}/restore`, { method: 'POST', cookie: ac })).status === 200, 'admin restores any');

const audit = (await req('/api/admin/audit', { cookie: ac })).data.slice(0, 15).map((x) => x.action);
ok(audit.includes('復原協同主持人') && audit.includes('刪除協同主持人（移至回收區）'), 'audit ' + audit);

// 清理
for (const p of [pa, pb, padm]) await req(`/api/team/${p.data.id}`, { method: 'DELETE', cookie: ac });
await req(`/api/schools/members/${A.m.data.id}`, { method: 'DELETE', cookie: ac });
await req(`/api/schools/members/${Bs.m.data.id}`, { method: 'DELETE', cookie: ac });
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
