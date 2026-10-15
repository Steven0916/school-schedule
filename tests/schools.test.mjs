import { B, pw } from './helpers.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log('FAIL', m)));
const req = async (p, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });
  const sc = r.headers.get('set-cookie');
  return { status: r.status, data: await r.json().catch(() => null), cookie: sc && sc.split(';')[0] };
};

const ac = (await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: pw } })).cookie;
const tag = Date.now().toString(36);
const NAME = '測試國中' + tag;

// 公開讀取；預設三所學校
const list = await req('/api/schools');
ok(list.status === 200 && Array.isArray(list.data), 'public list');
const seed = Object.fromEntries(list.data.map((s) => [s.name, s.county]));
ok(seed['石榴國中'] === '雲林縣' && seed['東榮國中'] === '嘉義縣' && seed['永慶高中'] === '嘉義縣', 'seeded schools ' + JSON.stringify(seed));
ok(list.data.findIndex((s) => s.county === '雲林縣') < list.data.findIndex((s) => s.county === '嘉義縣'), '雲林縣 listed first');

// 權限
const m = await req('/api/schools/members', { method: 'POST', body: { schoolName: '石榴國中', username: 'sc' + tag, password: 'abc123' }, cookie: ac });
const sc = (await req('/api/schools/login', { method: 'POST', body: { username: 'sc' + tag, password: 'abc123' } })).cookie;
ok((await req('/api/schools', { method: 'POST', body: { name: NAME, county: '雲林縣' } })).status === 403, 'anon cannot add');
ok((await req('/api/schools', { method: 'POST', body: { name: NAME, county: '雲林縣' }, cookie: sc })).status === 403, 'school cannot add');

// 新增與驗證
const add = await req('/api/schools', { method: 'POST', body: { name: ` ${NAME} `, county: '雲林縣' }, cookie: ac });
ok(add.status === 200 && add.data.name === NAME && add.data.county === '雲林縣', 'admin adds (trimmed)');
ok((await req('/api/schools', { method: 'POST', body: { name: NAME, county: '嘉義縣' }, cookie: ac })).status === 409, 'duplicate name rejected');
ok((await req('/api/schools', { method: 'POST', body: { name: '某校', county: '台南市' }, cookie: ac })).status === 400, 'bad county rejected');
ok((await req('/api/schools', { method: 'POST', body: { name: '  ', county: '雲林縣' }, cookie: ac })).status === 400, 'blank name rejected');

// 新學校可用在期程地點與參與學校
const ev = await req('/api/events', { method: 'POST', body: { title: '學校設定測試', category: '會議', startDate: '2026-12-01', location: NAME, schools: [NAME, '石榴國中'] }, cookie: ac });
ok(ev.status === 200 && ev.data.location === NAME && ev.data.schools.includes(NAME), 'new school usable in events');
ok((await req('/api/events', { method: 'POST', body: { title: 'x', category: '會議', startDate: '2026-12-01', location: '不存在的學校' }, cookie: ac })).status === 400, 'unknown location rejected');
ok((await req('/api/events', { method: 'POST', body: { title: 'x', category: '會議', startDate: '2026-12-01', location: '線上會議' }, cookie: ac })).status === 200, 'online location ok');

// 計畫成員：縣市跟著學校
const tm = await req('/api/team', { method: 'POST', body: { role: '協同主持人', title: '教師', name: '學校設定成員' + tag, school: NAME, county: '嘉義縣' }, cookie: ac });
ok(tm.status === 200 && tm.data.county === '雲林縣', 'team county from school');

// 改名、改縣市：一併更新期程與名單
const NEW = NAME + '改';
const ren = await req(`/api/schools/${add.data.id}`, { method: 'PUT', body: { name: NEW, county: '嘉義縣' }, cookie: ac });
ok(ren.status === 200 && ren.data.name === NEW && ren.data.county === '嘉義縣', 'rename + recounty');
const evAfter = (await req('/api/events', { cookie: ac })).data.find((e) => e.id === ev.data.id);
ok(evAfter.location === NEW && evAfter.schools.includes(NEW) && !evAfter.schools.includes(NAME) && evAfter.schools.includes('石榴國中'), 'event location + schools renamed ' + JSON.stringify(evAfter));
const tmAfter = (await req('/api/team', { cookie: ac })).data.find((p) => p.id === tm.data.id);
ok(tmAfter.school === NEW && tmAfter.county === '嘉義縣', 'team school renamed and county follows ' + JSON.stringify(tmAfter));
ok((await req(`/api/schools/${add.data.id}`, { method: 'PUT', body: { name: '石榴國中', county: '雲林縣' }, cookie: ac })).status === 409, 'rename into existing name rejected');
ok((await req(`/api/schools/${add.data.id}`, { method: 'PUT', body: { name: NEW, county: '嘉義縣' }, cookie: sc })).status === 403, 'school cannot edit');

// 刪除：移出清單，既有資料保留
ok((await req(`/api/schools/${add.data.id}`, { method: 'DELETE', cookie: sc })).status === 403, 'school cannot delete');
ok((await req(`/api/schools/${add.data.id}`, { method: 'DELETE', cookie: ac })).status === 200, 'admin deletes');
ok(!(await req('/api/schools')).data.some((s) => s.id === add.data.id), 'gone from list');
ok((await req('/api/events', { cookie: ac })).data.find((e) => e.id === ev.data.id).location === NEW, 'existing event keeps name');
ok((await req('/api/events', { method: 'POST', body: { title: 'x', category: '會議', startDate: '2026-12-01', location: NEW }, cookie: ac })).status === 400, 'deleted school no longer selectable');

const audit = (await req('/api/admin/audit', { cookie: ac })).data.slice(0, 20).map((x) => x.action);
ok(['新增學校', '修改學校', '刪除學校'].every((a) => audit.includes(a)), 'audit ' + audit);

// 清理
for (const e of (await req('/api/events', { cookie: ac })).data.filter((e) => e.title === '學校設定測試' || e.title === 'x')) {
  await req(`/api/events/${e.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: ac });
}
await req(`/api/team/${tm.data.id}`, { method: 'DELETE', cookie: ac });
await req(`/api/schools/members/${m.data.id}`, { method: 'DELETE', cookie: ac });
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
