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
const base = { title: '參與學校測試', category: '會議', startDate: '2026-11-20', endDate: '', time: '', location: '', owner: '', notes: '' };

const e1 = await req('/api/events', { method: 'POST', body: { ...base, schools: ['永慶高中', '石榴國中', '假學校', '石榴國中'] }, cookie: ac });
ok(e1.status === 200 && JSON.stringify(e1.data.schools) === JSON.stringify(['石榴國中', '永慶高中']), 'schools filtered, ordered, deduped ' + JSON.stringify(e1.data.schools));
const e2 = await req('/api/events', { method: 'POST', body: { ...base, title: '無參與學校' }, cookie: ac });
ok(e2.status === 200 && Array.isArray(e2.data.schools) && e2.data.schools.length === 0, 'schools optional');
const e3 = await req('/api/events', { method: 'POST', body: { ...base, title: '錯誤格式', schools: '石榴國中' }, cookie: ac });
ok(e3.status === 200 && e3.data.schools.length === 0, 'non-array ignored');

const up = await req(`/api/events/${e1.data.id}`, { method: 'PUT', body: { ...base, schools: ['東榮國中'] }, cookie: ac });
ok(up.status === 200 && JSON.stringify(up.data.schools) === '["東榮國中"]', 'edit schools');
const pub = (await req('/api/events')).data.find((x) => x.id === e1.data.id);
ok(pub && JSON.stringify(pub.schools) === '["東榮國中"]', 'public list has schools');

// 觀課自動建立的期程：勾選填報學校
const m = await req('/api/schools/members', { method: 'POST', body: { schoolName: '永慶高中', username: 'es' + Date.now().toString(36), password: 'abc123' }, cookie: ac });
const sc = (await req('/api/schools/login', { method: 'POST', body: { username: m.data.username, password: 'abc123' } })).cookie;
const o = await req('/api/observations', { method: 'POST', body: { date: '2026-11-21', subject: '理化', designer: '某師', grade: 9, className: '2', students: 25, periods: 1, minutes: 45, unit: '參與學校單元', modes: ['AI教學'] }, cookie: sc });
const oe = (await req('/api/events', { cookie: sc })).data.find((x) => x.title === '公開觀課｜理化｜參與學校單元');
ok(oe && JSON.stringify(oe.schools) === '["永慶高中"]', 'observation event ticks reporting school ' + JSON.stringify(oe && oe.schools));

for (const e of [e1, e2, e3]) await req(`/api/events/${e.data.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: ac });
await req(`/api/observations/${o.data.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: sc });
await req(`/api/schools/members/${m.data.id}`, { method: 'DELETE', cookie: ac });
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
