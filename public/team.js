'use strict';

// 計畫成員頁面（共用工具在 common.js）

const TEAM_ROLES = ['總召', '副總召', '計畫主持人', '協同主持人'];
const TEAM_TITLES = ['校長', '主任', '組長', '教師', '職員'];
const KNOWN_SCHOOLS = ['石榴國中', '東榮國中', '永慶高中'];
const TEAM_COUNTIES = ['雲林縣', '嘉義縣'];

const state = {
  role: 'viewer',
  schoolName: '',
  username: '',
  people: [],
  loading: true,
  loadError: '',
};

const canEdit = () => state.role !== 'viewer';

async function load() {
  try {
    state.people = await api('/api/team');
    state.loadError = '';
  } catch (err) {
    state.loadError = err.message;
  } finally {
    state.loading = false;
    render();
  }
}

// 新增或編輯名單（existing 為 null 時是新增）
function openPersonForm(role, existing = null) {
  const select = (label, options, value) =>
    h(
      'select',
      { className: 'form-select', required: true, 'aria-label': label, value },
      h('option', { value: '' }, '請選擇'),
      options.map((o) => h('option', { value: o }, o))
    );
  const county = select('縣市', TEAM_COUNTIES, existing?.county || '');
  const title = select('身分', TEAM_TITLES, existing?.title || '');
  const listSelect = select('名單', TEAM_ROLES, role);
  const name = h('input', { required: true, maxlength: 40, placeholder: '例如：王小明', autocomplete: 'off', value: existing?.name || '' });
  // 服務學校：提供常用學校讓使用者選，也可自行輸入（例如教育處）
  const schoolOptions = [...new Set([...KNOWN_SCHOOLS, ...state.people.map((p) => p.school).filter(Boolean)])];
  const schoolList = h('datalist', { id: 'school-options' }, schoolOptions.map((s) => h('option', { value: s })));
  const school = h('input', {
    required: true,
    maxlength: 40,
    list: 'school-options',
    placeholder: '例如：石榴國中',
    autocomplete: 'off',
    value: existing ? existing.school : state.schoolName,
  });
  const error = h('p', { className: 'form-error', role: 'alert', hidden: true });
  const cancel = h('button', { type: 'button', className: 'cancel-button', onClick: closeModal }, '取消');
  const save = h('button', { type: 'submit', className: 'submit-button' }, existing ? '儲存' : '加入名單');
  const form = h(
    'form',
    { className: 'login-form' },
    existing && h('label', {}, '名單', listSelect),
    h('label', {}, '縣市', county),
    h('label', {}, '身分', title),
    h('label', {}, '姓名', name),
    h('label', {}, '服務學校', school, schoolList),
    error,
    h('div', { className: 'modal-actions' }, cancel, save)
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    modalBusy = true;
    save.disabled = cancel.disabled = true;
    try {
      const body = { role: existing ? listSelect.value : role, title: title.value, name: name.value, school: school.value, county: county.value };
      const person = await api(existing ? `/api/team/${existing.id}` : '/api/team', {
        method: existing ? 'PUT' : 'POST',
        body,
      });
      state.people = existing
        ? state.people.map((p) => (p.id === existing.id ? person : p))
        : [...state.people, person];
      closeModal();
      render();
      notify(existing ? `已更新 ${person.name}` : `已將 ${person.name} 加入${role}名單`);
    } catch (err) {
      modalBusy = false;
      save.disabled = cancel.disabled = false;
      setError(error, err.message);
    }
  });
  openModal(
    existing ? `編輯${existing.role}` : `新增${role}`,
    existing ? '修改縣市、身分、姓名或服務學校；若放錯名單，可在「名單」改到另一邊。' : '選擇縣市與身分、輸入姓名與服務學校後加入名單。',
    form
  );
  (existing ? name : title).focus();
}

function openRemovePerson(p) {
  const error = h('p', { className: 'form-error', role: 'alert', hidden: true });
  const cancel = h('button', { type: 'button', className: 'cancel-button', onClick: closeModal }, '取消');
  const confirm = h('button', { type: 'button', className: 'danger-button' }, '確認刪除');
  confirm.addEventListener('click', async () => {
    modalBusy = true;
    confirm.disabled = cancel.disabled = true;
    try {
      await api(`/api/team/${p.id}`, { method: 'DELETE' });
      state.people = state.people.filter((x) => x.id !== p.id);
      closeModal();
      render();
      notify('已從名單移除');
    } catch (err) {
      modalBusy = false;
      confirm.disabled = cancel.disabled = false;
      setError(error, err.message);
    }
  });
  openModal(
    `從${p.role}名單移除？`,
    `「${p.name}」將從名單中移除。`,
    h('div', {}, error, h('div', { className: 'modal-actions' }, cancel, confirm))
  );
}

async function logout() {
  try {
    await api(state.role === 'owner' ? '/api/admin/logout' : '/api/schools/logout', { method: 'POST' });
    window.location.reload();
  } catch (err) {
    notify(err.message || '登出失敗');
  }
}

function personItem(p, role) {
  const missing = (text) => h('span', { className: 'title-missing' }, text);
  return h(
    'li',
    {},
    h(
      'div',
      {},
      h('strong', {}, p.name),
      p.title ? h('span', { className: 'title-tag' }, p.title) : missing('未選身分'),
      p.school ? h('span', { className: 'school-name' }, p.school) : missing('未填服務學校')
    ),
    p.canModify &&
      h(
        'div',
        { className: 'team-actions' },
        h(
          'button',
          { type: 'button', className: 'edit-button', 'aria-label': `編輯 ${p.name}`, onClick: () => openPersonForm(role, p) },
          icon('pencil', 15),
          h('span', {}, '編輯')
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'delete-button',
            title: '從名單移除',
            'aria-label': `將 ${p.name} 從${role}名單移除`,
            onClick: () => openRemovePerson(p),
          },
          icon('trash', 17)
        )
      )
  );
}

function roleGroup(role) {
  const people = state.people.filter((p) => p.role === role);
  let body;
  if (state.loading) body = h('div', { className: 'trash-empty' }, '正在載入…');
  else if (state.loadError) body = h('div', { className: 'trash-empty' }, state.loadError);
  else if (!people.length) body = h('div', { className: 'trash-empty' }, '尚未新增名單。');
  else
    body = [...TEAM_COUNTIES, ''].map((c) => {
      const group = people.filter((p) => (p.county || '') === c);
      if (!group.length) return null;
      return h(
        'div',
        { className: 'county-group' },
        h('h3', { className: c ? 'county-title' : 'county-title missing' }, c || '未選縣市', h('span', {}, `${group.length} 人`)),
        h('ul', { className: 'team-list' }, group.map((p) => personItem(p, role)))
      );
    });

  return h(
    'section',
    { className: 'team-group' },
    h(
      'div',
      { className: 'team-group-top' },
      h('h2', {}, role, h('span', {}, state.loading ? '' : `${people.length} 人`)),
      canEdit() && h('button', { className: 'empty-add', onClick: () => openPersonForm(role) }, icon('plus', 16), '新增名單')
    ),
    body
  );
}

function render() {
  const banner = $('access-banner');
  if (state.role === 'owner') banner.replaceChildren(h('span', {}, '管理者帳號'), h('button', { onClick: logout }, '登出'));
  else if (state.role === 'school')
    banner.replaceChildren(h('span', {}, `學校端 · ${state.schoolName} · ${state.username}`), h('button', { onClick: logout }, '登出'));
  else
    banner.replaceChildren(
      h('span', {}, '公開瀏覽 · 姓名已部分隱藏，登入後可看完整名單並新增、編輯。'),
      h('a', { href: '/school/login?next=/team' }, '學校端登入')
    );

  $('team-groups').replaceChildren(...TEAM_ROLES.map(roleGroup));
  $('intro-actions').replaceChildren(
    canEdit()
      ? h('button', { className: 'empty-add', disabled: !state.people.length, onClick: exportPeople }, icon('download', 16), '下載 Excel')
      : ''
  );
}

function exportPeople() {
  const countyOrder = (p) => (TEAM_COUNTIES.includes(p.county) ? TEAM_COUNTIES.indexOf(p.county) : 9);
  const order = (p) => TEAM_ROLES.indexOf(p.role) * 100 + countyOrder(p) * 10 + TEAM_TITLES.indexOf(p.title);
  const rows = [...state.people]
    .sort((a, b) => order(a) - order(b) || a.id - b.id)
    .map((p) => [p.role, p.county || '未選', p.title || '未選身分', p.name, p.school || '未填', p.createdBySchool || '管理者']);
  downloadXlsx(`計畫成員名單_${todayTaipei()}.xlsx`, '計畫成員', ['名單', '縣市', '身分', '姓名', '服務學校', '新增者'], rows);
}

async function init() {
  for (const el of document.querySelectorAll('[data-icon]')) {
    el.append(icon(el.dataset.icon, Number(el.dataset.size) || 16));
  }
  try {
    const me = await api('/api/me');
    state.role = me.role;
    state.schoolName = me.schoolName || '';
    state.username = me.username || '';
  } catch {
    state.role = 'viewer';
  }
  render();
  await load();
}

init();
