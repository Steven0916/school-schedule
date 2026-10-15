import { B, pw } from './helpers.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log('FAIL', m)));

async function req(path, { method = 'GET', body, cookie } = {}) {
  const r = await fetch(B + path, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  let data; try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data, cookie: sc && sc.split(';')[0], headers: r.headers };
}

for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/me'); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

const page = await fetch(B + '/observations');
ok(page.status === 200 && (await page.text()).includes('公開觀課填報'), 'page loads');
for (const f of ['/observations.js', '/common.js', '/app.js', '/']) ok((await fetch(B + f)).status === 200, f);

const valid = { date: '2026-10-20', subject: '數學', designer: '王老師', grade: 7, className: '1', students: 28, periods: 2, minutes: 45, unit: '一元一次方程式', modes: ['AI備課', 'AI評量', 'bogus'] };
ok((await req('/api/observations', { method: 'POST', body: valid })).status === 401, 'anon cannot post');

const admin = await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: pw } });
ok(admin.status === 200, 'admin login ' + JSON.stringify(admin.data));
const ac = admin.cookie;

const created = await req('/api/observations', { method: 'POST', body: valid, cookie: ac });
ok(created.status === 200 && created.data.modes.join() === 'AI備課,AI評量' && created.data.canModify, 'create ' + JSON.stringify(created.data));

const bad = [
  [{ date: '2026-02-30' }, '日期'], [{ modes: [] }, '模式'], [{ grade: 13 }, '年級'], [{ grade: 6 }, '年級'], [{ students: 0 }, '人數'],
  [{ periods: 1.5 }, '總節數'], [{ minutes: 'x' }, '每節'], [{ subject: '  ' }, '領域'], [{ unit: '' }, '單元'], [{ className: '' }, '班級'],
];
for (const [patch, word] of bad) {
  const r = await req('/api/observations', { method: 'POST', body: { ...valid, ...patch }, cookie: ac });
  ok(r.status === 400 && r.data.error.includes(word), `reject ${JSON.stringify(patch)} → ${r.status} ${r.data?.error}`);
}

// 學校帳號
const uname = 'obs' + Date.now().toString(36);
await req('/api/schools/members', { method: 'POST', body: { schoolName: '測試國中', username: uname, password: 'password123' }, cookie: ac });
const school = await req('/api/schools/login', { method: 'POST', body: { username: uname, password: 'password123' } });
const sc = school.cookie;
const mine = await req('/api/observations', { method: 'POST', body: { ...valid, unit: '學校的單元', modes: AI_ALL() }, cookie: sc });
ok(mine.status === 200 && mine.data.createdBySchool === '測試國中' && mine.data.modes.length === 6, 'school create');

const list = await req('/api/observations', { cookie: sc });
const adminRec = list.data.find((r) => r.id === created.data.id);
ok(adminRec && adminRec.canModify === false, 'school cannot modify admin record (flag)');
ok((await req(`/api/observations/${created.data.id}`, { method: 'PUT', body: valid, cookie: sc })).status === 403, 'school PUT others 403');
ok((await req(`/api/observations/${created.data.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: sc })).status === 403, 'school DELETE others 403');

const edited = await req(`/api/observations/${mine.data.id}`, { method: 'PUT', body: { ...valid, unit: '改過的單元' }, cookie: sc });
ok(edited.status === 200 && edited.data.unit === '改過的單元', 'school edit own');
ok((await req(`/api/observations/${mine.data.id}`, { method: 'DELETE', body: {}, cookie: sc })).status === 400, 'delete needs confirmation');
ok((await req(`/api/observations/${mine.data.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: sc })).status === 200, 'school delete own');

const anon = await req('/api/observations');
ok(anon.status === 200 && anon.data.every((r) => !r.canModify) && !anon.data.some((r) => r.id === mine.data.id), 'public list, deleted hidden');

const pubRec = anon.data.find((r) => r.id === created.data.id);
ok(pubRec.designer === '王○師', 'anon sees masked name: ' + pubRec.designer);
ok(!JSON.stringify(anon.data).includes('王老師'), 'full name not leaked to anon');
ok(list.data.find((r) => r.id === created.data.id).designer === '王老師', 'school sees full name');

ok((await req(`/api/observations/${created.data.id}`, { method: 'DELETE', body: { confirmation: '確定刪除' }, cookie: ac })).status === 200, 'admin delete any');

const audit = await req('/api/admin/audit', { cookie: ac });
const actions = audit.data.slice(0, 6).map((a) => a.action);
ok(['填報公開觀課', '編輯公開觀課', '刪除公開觀課'].every((a) => actions.includes(a)), 'audit ' + actions);

// 登入後導回
const redir = await req('/school/login?next=/observations', { cookie: sc });
ok(redir.status === 302 && redir.headers.get('location') === '/observations', 'login redirect next');
const evil = await req('/school/login?next=//evil.com', { cookie: sc });
ok(evil.headers.get('location') === '/', 'reject open redirect');

console.log(`${pass} passed, ${fail} failed`);
function AI_ALL() { return ['AI備課', 'AI教學', 'AI評量', 'AI協作', 'AI創作', 'AI探究']; }
process.exitCode = fail ? 1 : 0;
