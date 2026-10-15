import { B, pw } from './helpers.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log('FAIL', m)));
const req = async (p, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });
  const sc = r.headers.get('set-cookie');
  return { status: r.status, data: await r.json().catch(() => null), cookie: sc && sc.split(';')[0] };
};

// 高中部：十～十二年級可以填報；觀課自動建立的期程備註顯示正確年級
const ac = (await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: pw } })).cookie;
const tag = Date.now().toString(36);
const base = { date: '2026-11-25', subject: '物理', designer: '高中老師', className: '1', students: 32, periods: 1, minutes: 50, modes: ['AI探究'] };
const created = [];
for (const [grade, label] of [[10, '十年級'], [11, '十一年級'], [12, '十二年級']]) {
  const unit = `高中部單元${grade}-${tag}`;
  const o = await req('/api/observations', { method: 'POST', body: { ...base, grade, unit }, cookie: ac });
  ok(o.status === 200 && o.data.grade === grade, `grade ${grade} accepted`);
  created.push(o.data?.id);
  const ev = (await req('/api/events', { cookie: ac })).data.find((e) => e.title === `公開觀課｜物理｜${unit}`);
  ok(ev && ev.notes.startsWith(`${label} 1 班`), `event notes show ${label}: ` + (ev && ev.notes));
}
ok((await req('/api/observations', { method: 'POST', body: { ...base, grade: 7, unit: '國中' + tag }, cookie: ac })).status === 200, 'grade 7 still ok');

for (const id of created) await req(`/api/observations/${id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: ac });
const left = (await req('/api/observations', { cookie: ac })).data.find((o) => o.unit === '國中' + tag);
if (left) await req(`/api/observations/${left.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: ac });
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
