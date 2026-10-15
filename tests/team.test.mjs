import { B, pw } from './helpers.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log('FAIL', m)));
const req = async (p, { method = 'GET', body, cookie } = {}) => {
  if (p.startsWith('/api/team') && body && !('school' in body) && (method === 'POST' || method === 'PUT')) body = { ...body, school: '石榴國中' };
  if (p.startsWith('/api/team') && body && !('county' in body) && (method === 'POST' || method === 'PUT')) body = { ...body, county: '雲林縣' };
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });
  const sc = r.headers.get('set-cookie');
  return { status: r.status, data: await r.json().catch(() => null), cookie: sc && sc.split(';')[0] };
};
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/me'); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

for (const p of ['/team', '/team.js', '/', '/observations', '/common.js']) ok((await fetch(B + p)).status === 200, p);

const ac = (await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: pw } })).cookie;
const u = 'tm' + Date.now().toString(36);
const m = await req('/api/schools/members', { method: 'POST', body: { schoolName: '石榴國中', username: u, password: 'abc123' }, cookie: ac });
const sc = (await req('/api/schools/login', { method: 'POST', body: { username: u, password: 'abc123' } })).cookie;

ok((await req('/api/team', { method: 'POST', body: { role: '計畫主持人', title: '校長', name: '王大明' } })).status === 401, 'anon cannot add');
const a = await req('/api/team', { method: 'POST', body: { role: '計畫主持人', title: '校長', name: '王大明' }, cookie: ac });
ok(a.status === 200 && a.data.canModify && !a.data.createdBySchool, 'admin add');
const s = await req('/api/team', { method: 'POST', body: { role: '協同主持人', title: '教師', name: ' 李小華 ' }, cookie: sc });
ok(s.status === 200 && s.data.name === '李小華' && s.data.createdBySchool === '石榴國中', 'school add (trimmed)');
ok((await req('/api/team', { method: 'POST', body: { role: '校長', title: '校長', name: 'x' }, cookie: ac })).status === 400, 'bad role');
ok((await req('/api/team', { method: 'POST', body: { role: '計畫主持人', title: '主任', name: '  ' }, cookie: ac })).status === 400, 'empty name');
ok((await req('/api/team', { method: 'POST', body: { role: '計畫主持人', title: '主任', name: 'x'.repeat(41) }, cookie: ac })).status === 400, 'long name');

ok(a.data.title === '校長', 'title saved');
// 服務學校
ok(a.data.school === '石榴國中', 'school saved');
// 縣市
ok(a.data.county === '雲林縣', 'county saved');
ok((await req('/api/team', { method: 'POST', body: { role: '計畫主持人', title: '校長', name: '某人', county: '' }, cookie: ac })).status === 400, 'missing county rejected');
ok((await req('/api/team', { method: 'POST', body: { role: '計畫主持人', title: '校長', name: '某人', county: '台南市' }, cookie: ac })).status === 400, 'other county rejected');
const cy = await req(`/api/team/${a.data.id}`, { method: 'PUT', body: { role: '計畫主持人', title: '校長', name: '王大明', county: '嘉義縣' }, cookie: ac });
ok(cy.status === 200 && cy.data.county === '嘉義縣', 'edit county');
ok((await req('/api/team')).data.find((p) => p.id === a.data.id).county === '嘉義縣', 'anon sees county');
ok((await req('/api/team', { method: 'POST', body: { role: '計畫主持人', title: '校長', name: '某人', school: '  ' }, cookie: ac })).status === 400, 'blank school rejected');
ok((await req('/api/team', { method: 'POST', body: { role: '計畫主持人', title: '校長', name: '某人', school: 'x'.repeat(41) }, cookie: ac })).status === 400, 'long school rejected');
const sch = await req(`/api/team/${a.data.id}`, { method: 'PUT', body: { role: '計畫主持人', title: '校長', name: '王大明', school: ' 雲林縣教育處 ' }, cookie: ac });
ok(sch.status === 200 && sch.data.school === '雲林縣教育處', 'edit school (trimmed) ' + JSON.stringify(sch.data));
ok((await req('/api/team')).data.find((p) => p.id === a.data.id).school === '雲林縣教育處', 'anon sees school');
// 總召、副總召
const z = await req('/api/team', { method: 'POST', body: { role: '總召', title: '校長', name: '總召甲' }, cookie: ac });
ok(z.status === 200 && z.data.role === '總召', 'add 總召');
const fz = await req('/api/team', { method: 'POST', body: { role: '副總召', title: '主任', name: '副總召乙' }, cookie: sc });
ok(fz.status === 200 && fz.data.role === '副總召' && fz.data.createdBySchool === '石榴國中', 'school adds 副總召');
const mv = await req(`/api/team/${fz.data.id}`, { method: 'PUT', body: { role: '總召', title: '主任', name: '副總召乙' }, cookie: sc });
ok(mv.status === 200 && mv.data.role === '總召', 'move 副總召 → 總召');
ok((await req('/api/team', { method: 'POST', body: { role: '總幹事', title: '校長', name: 'x' }, cookie: ac })).status === 400, 'unknown role rejected');
await req(`/api/team/${z.data.id}`, { method: 'DELETE', cookie: ac });
await req(`/api/team/${fz.data.id}`, { method: 'DELETE', cookie: sc });
ok((await req('/api/team', { method: 'POST', body: { role: '計畫主持人', name: '某人' }, cookie: ac })).status === 400, 'missing title');
ok((await req('/api/team', { method: 'POST', body: { role: '計畫主持人', title: '家長', name: '某人' }, cookie: ac })).status === 400, 'bad title');
// 編輯
const e1 = await req(`/api/team/${s.data.id}`, { method: 'PUT', body: { role: '計畫主持人', title: '主任', name: '李曉華' }, cookie: sc });
ok(e1.status === 200 && e1.data.name === '李曉華' && e1.data.title === '主任' && e1.data.role === '計畫主持人', 'school edits own (move list)');
ok((await req(`/api/team/${a.data.id}`, { method: 'PUT', body: { role: '計畫主持人', title: '教師', name: 'x' }, cookie: sc })).status === 403, 'school edit others 403');
ok((await req(`/api/team/${a.data.id}`, { method: 'PUT', body: { role: '計畫主持人', title: '教師', name: 'x' } })).status === 401, 'anon edit 401');
ok((await req(`/api/team/${s.data.id}`, { method: 'PUT', body: { role: '計畫主持人', title: '', name: 'x' }, cookie: ac })).status === 400, 'edit needs title');
const g = await req('/api/team', { method: 'POST', body: { role: '協同主持人', title: '組長', name: '組長甲' }, cookie: ac });
ok(g.status === 200 && g.data.title === '組長', 'title 組長 accepted');
await req(`/api/team/${g.data.id}`, { method: 'DELETE', cookie: ac });
const e2 = await req(`/api/team/${a.data.id}`, { method: 'PUT', body: { role: '計畫主持人', title: '組長', name: '王大明' }, cookie: ac });
ok(e2.status === 200 && e2.data.title === '組長', 'admin edit to 組長');
await req(`/api/team/${a.data.id}`, { method: 'PUT', body: { role: '計畫主持人', title: '校長', name: '王大明' }, cookie: ac });
const anon = await req('/api/team');
ok(anon.data.find((p) => p.id === a.data.id).title === '校長', 'anon sees title');
ok(anon.data.find((p) => p.id === a.data.id).name === '王○明', 'anon masked');
ok(!JSON.stringify(anon.data).includes('王大明') && anon.data.every((p) => !p.canModify), 'anon no full name / no modify');
const schoolView = await req('/api/team', { cookie: sc });
ok(schoolView.data.find((p) => p.id === a.data.id).name === '王大明', 'school sees full');
ok(schoolView.data.find((p) => p.id === a.data.id).canModify === false, 'school cannot modify admin entry');

ok((await req(`/api/team/${a.data.id}`, { method: 'DELETE', cookie: sc })).status === 403, 'school delete others 403');
ok((await req(`/api/team/${s.data.id}`, { method: 'DELETE', cookie: sc })).status === 200, 'school delete own');
ok((await req(`/api/team/${a.data.id}`, { method: 'DELETE', cookie: ac })).status === 200, 'admin delete');
ok((await req(`/api/team/${a.data.id}`, { method: 'DELETE', cookie: ac })).status === 404, 'delete missing 404');

const audit = (await req('/api/admin/audit', { cookie: ac })).data.slice(0, 25).map((x) => x.action);
ok(audit.includes('新增計畫主持人') && audit.includes('刪除計畫主持人（移至回收區）') && audit.includes('編輯計畫成員'), 'audit ' + audit);

await req(`/api/schools/members/${m.data.id}`, { method: 'DELETE', cookie: ac });
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
