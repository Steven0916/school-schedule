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
const tag = Date.now().toString(36);
const NAME = '重複測試' + tag;
const base = { role: '總召', county: '雲林縣', title: '校長', name: NAME, school: '石榴國中' };
const add = (extra = {}) => req('/api/team', { method: 'POST', body: { ...base, ...extra }, cookie: ac });
const created = [];

const first = await add();
ok(first.status === 200, 'first add');
created.push(first.data.id);

// 同名同校：擋下（連空白不同也算）
const d1 = await add();
ok(d1.status === 409 && !d1.data.duplicate && d1.data.error.includes('已在總召名單中'), 'exact dup blocked ' + JSON.stringify(d1.data));
const d2 = await add({ name: NAME.slice(0, 2) + ' ' + NAME.slice(2), school: ' 石榴 國中 ' });
ok(d2.status === 409 && !d2.data.duplicate, 'dup with spaces blocked');
ok((await add({ confirmDuplicate: true })).status === 409, 'exact dup blocked even with confirm');

// 同名不同校：需確認
const d3 = await add({ school: '東榮國中' });
ok(d3.status === 409 && d3.data.duplicate === true && d3.data.error.includes('石榴國中'), 'same name other school asks confirm ' + JSON.stringify(d3.data));
const d4 = await add({ school: '東榮國中', confirmDuplicate: true });
ok(d4.status === 200, 'confirmed same name other school allowed');
created.push(d4.data.id);

// 不同名單可以同一人
const other = await add({ role: '計畫主持人' });
ok(other.status === 200, 'same person on another list allowed');
created.push(other.data.id);

// 編輯：改成與他人相同 → 擋下；編輯自己不變 → 可以
const third = await add({ name: NAME + '丙' });
created.push(third.data.id);
const e1 = await req(`/api/team/${third.data.id}`, { method: 'PUT', body: { ...base }, cookie: ac });
ok(e1.status === 409 && !e1.data.duplicate, 'edit into exact dup blocked');
const e2 = await req(`/api/team/${first.data.id}`, { method: 'PUT', body: { ...base, title: '主任' }, cookie: ac });
ok(e2.status === 200 && e2.data.title === '主任', 'editing self not a dup');
const e4 = await req(`/api/team/${third.data.id}`, { method: 'PUT', body: { ...base, school: '永慶高中' }, cookie: ac });
ok(e4.status === 409 && e4.data.duplicate === true, 'rename to same name other school asks confirm');
// 移到另一份名單時，若該名單已有同名同校 → 擋下
const e3 = await req(`/api/team/${third.data.id}`, { method: 'PUT', body: { ...base, role: '計畫主持人' }, cookie: ac });
ok(e3.status === 409, 'moving into list with exact dup blocked');

// 回收區：刪除後可再加入；回收區復原若造成同名同校則擋下
await req(`/api/team/${first.data.id}`, { method: 'DELETE', cookie: ac });
const again = await add({ confirmDuplicate: true }); // 名單上仍有同名不同校的人，需確認
ok(again.status === 200, 're-add after delete allowed (trash ignored)');
created.push(again.data.id);
const rs = await req(`/api/team/${first.data.id}/restore`, { method: 'POST', cookie: ac });
ok(rs.status === 409 && rs.data.error.includes('已在總召名單中'), 'restore into exact dup blocked ' + JSON.stringify(rs.data));

for (const id of created) await req(`/api/team/${id}`, { method: 'DELETE', cookie: ac });
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
