import { B, pw } from './helpers.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log('FAIL', m)));
const req = async (p, { method = 'GET', body, cookie, raw, headers = {} } = {}) => {
  const r = await fetch(B + p, {
    method,
    headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: raw ?? (body && JSON.stringify(body)),
  });
  const sc = r.headers.get('set-cookie');
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => null) : Buffer.from(await r.arrayBuffer());
  return { status: r.status, data, cookie: sc && sc.split(';')[0], headers: r.headers };
};
for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/me'); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

const ac = (await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: pw } })).cookie;
const u = 'ft' + Date.now().toString(36);
const m = await req('/api/schools/members', { method: 'POST', body: { schoolName: '石榴國中', username: u, password: 'abc123' }, cookie: ac });
const sc = (await req('/api/schools/login', { method: 'POST', body: { username: u, password: 'abc123' } })).cookie;
const u2 = u + 'b';
const m2 = await req('/api/schools/members', { method: 'POST', body: { schoolName: '東榮國中', username: u2, password: 'abc123' }, cookie: ac });
const sc2 = (await req('/api/schools/login', { method: 'POST', body: { username: u2, password: 'abc123' } })).cookie;

// ---- 1. 觀課 → 期程 ----
const obsBody = { date: '2026-11-05', subject: '數學', designer: '王大明', grade: 8, className: '3', students: 27, periods: 2, minutes: 45, unit: '畢氏定理', modes: ['AI教學'] };
const o = await req('/api/observations', { method: 'POST', body: obsBody, cookie: sc });
ok(o.status === 200 && o.data.fileCount === 0 && Array.isArray(o.data.files), 'create obs');
const ev = () => req('/api/events', { cookie: sc }).then((r) => r.data.find((e) => e.title === '公開觀課｜數學｜畢氏定理' || e.title === '公開觀課｜數學｜勾股定理'));
let e = await ev();
ok(e && e.category === '觀課計畫' && e.startDate === '2026-11-05' && e.location === '石榴國中' && e.owner === '石榴國中' && e.createdBySchool === '石榴國中', 'event auto-created ' + JSON.stringify(e));
ok(e && !e.notes.includes('王大明') && e.notes.includes('八年級 3 班'), 'event notes no designer name');
ok(e && e.canDelete === true, 'school can delete its auto event');
const anonEvents = await req('/api/events');
ok(!JSON.stringify(anonEvents.data).includes('王大明'), 'designer not in public events');

const ed = await req(`/api/observations/${o.data.id}`, { method: 'PUT', body: { ...obsBody, date: '2026-11-12', unit: '勾股定理' }, cookie: sc });
ok(ed.status === 200, 'edit obs');
e = await ev();
ok(e && e.title === '公開觀課｜數學｜勾股定理' && e.startDate === '2026-11-12', 'event follows edit ' + JSON.stringify(e && [e.title, e.startDate]));
const sameCount = (await req('/api/events', { cookie: sc })).data.filter((x) => x.title.startsWith('公開觀課｜數學｜')).length;
ok(sameCount === 1, 'no duplicate event, got ' + sameCount);

// 使用者刪掉期程後，再編輯觀課不會建回來
await req(`/api/events/${e.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: sc });
await req(`/api/observations/${o.data.id}`, { method: 'PUT', body: { ...obsBody, date: '2026-11-12', unit: '勾股定理' }, cookie: sc });
ok(!(await ev()), 'deleted event not recreated');
await req(`/api/events/${e.id}/restore`, { method: 'POST', body: { confirmation: '確定復原' }, cookie: sc });

// 管理者填報 → 期程沒有學校
const ao = await req('/api/observations', { method: 'POST', body: { ...obsBody, unit: '管理者單元' }, cookie: ac });
const ae = (await req('/api/events', { cookie: ac })).data.find((x) => x.title === '公開觀課｜數學｜管理者單元');
ok(ae && ae.owner === '' && ae.location === '' && !ae.createdBySchool, 'admin obs event');

// ---- 4. 附件 ----
const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2000, 65)]);
const up = (id, name, data, cookie, extra = {}) =>
  req(`/api/observations/${id}/files`, { method: 'POST', raw: data, cookie, headers: { 'X-File-Name': encodeURIComponent(name), 'Content-Type': 'application/octet-stream', ...extra } });
ok((await up(o.data.id, '教案.pdf', pdf)).status === 401, 'anon upload 401');
ok((await up(o.data.id, '教案.pdf', pdf, sc2)).status === 403, 'other school upload 403');
ok((await up(o.data.id, 'evil.html', pdf, sc)).status === 400, 'html rejected');
ok((await up(o.data.id, 'noext', pdf, sc)).status === 400, 'no ext rejected');
ok((await up(o.data.id, 'empty.pdf', Buffer.alloc(0), sc)).status === 400, 'empty rejected');
const big = await up(o.data.id, 'big.pdf', Buffer.alloc(10 * 1024 * 1024 + 1, 1), sc);
ok(big.status === 413, 'over 10MB rejected ' + big.status);
const f1 = await up(o.data.id, '教案 v2.pdf', pdf, sc);
ok(f1.status === 200 && f1.data.name === '教案 v2.pdf' && f1.data.size === pdf.length && f1.data.type === 'application/pdf', 'upload pdf ' + JSON.stringify(f1.data));
const f2 = await up(o.data.id, '../../照片.JPG', Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]), sc);
ok(f2.status === 200 && !f2.data.name.includes('/') && f2.data.type === 'image/jpeg', 'path stripped, jpg ' + JSON.stringify(f2.data));

const dl = await req(`/api/observation-files/${f1.data.id}`, { cookie: sc2 });
ok(dl.status === 200 && Buffer.compare(dl.data, pdf) === 0, 'other school (logged in) can download');
ok(dl.headers.get('content-type') === 'application/pdf' && dl.headers.get('content-disposition').startsWith('inline;') && dl.headers.get('content-disposition').includes(encodeURIComponent('教案 v2.pdf')), 'download headers ' + dl.headers.get('content-disposition'));
ok(dl.headers.get('x-content-type-options') === 'nosniff', 'nosniff');
ok((await req(`/api/observation-files/${f1.data.id}`)).status === 401, 'anon download 401');

const listAnon = (await req('/api/observations')).data.find((x) => x.id === o.data.id);
ok(listAnon.fileCount === 2 && listAnon.files.length === 0, 'anon sees count only');
const listSchool = (await req('/api/observations', { cookie: sc })).data.find((x) => x.id === o.data.id);
ok(listSchool.files.length === 2 && listSchool.files[0].name === '教案 v2.pdf', 'logged-in sees files');

ok((await req(`/api/observation-files/${f2.data.id}`, { method: 'DELETE', cookie: sc2 })).status === 403, 'other school delete 403');
ok((await req(`/api/observation-files/${f2.data.id}`, { method: 'DELETE', cookie: sc })).status === 200, 'owner deletes file');
ok((await req(`/api/observation-files/${f2.data.id}`, { cookie: sc })).status === 404, 'deleted file 404');

// 上限 10 個
for (let i = 0; i < 9; i++) await up(o.data.id, `p${i}.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47, i]), sc);
ok((await up(o.data.id, 'p10.png', Buffer.from([1]), sc)).status === 400, 'max 10 files');

// 刪除觀課 → 附件刪除、期程進回收區
const del = await req(`/api/observations/${o.data.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: sc });
ok(del.status === 200, 'delete obs');
ok((await req(`/api/observation-files/${f1.data.id}`, { cookie: sc })).status === 404, 'files gone with obs');
ok(!(await ev()), 'event removed from list');
const trash = (await req('/api/events/trash', { cookie: sc })).data;
ok(trash.some((x) => x.title === '公開觀課｜數學｜勾股定理'), 'event in trash');

const audit = (await req('/api/admin/audit', { cookie: ac })).data.slice(0, 30).map((x) => x.action);
ok(audit.includes('上傳觀課附件') && audit.includes('刪除觀課附件'), 'audit files');

// 清理
await req(`/api/observations/${ao.data.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: ac });
await req(`/api/schools/members/${m.data.id}`, { method: 'DELETE', cookie: ac });
await req(`/api/schools/members/${m2.data.id}`, { method: 'DELETE', cookie: ac });
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
