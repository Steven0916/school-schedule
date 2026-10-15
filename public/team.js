'use strict';

// 計畫成員頁面（共用工具在 common.js）

const TEAM_ROLES = ['總召', '副總召', '計畫主持人', '協同主持人'];
const TEAM_TITLES = ['校長', '主任', '組長', '教師', '職員'];
const TEAM_COUNTIES = ['雲林縣', '嘉義縣'];
const SPLIT_ROLES = ['計畫主持人', '協同主持人']; // 這些名單的雲林縣、嘉義縣分左右兩欄

const state = {
  role: 'viewer',
  schoolName: '',
  username: '',
  people: [],
  trash: [],
  trashOpen: false,
  loading: true,
  loadError: '',
};

const canEdit = () => state.role !== 'viewer';

async function load() {
  try {
    const [people, trash] = await Promise.all([
      api('/api/team'),
      canEdit() ? api('/api/team/trash') : Promise.resolve([]),
    ]);
    state.people = people;
    state.trash = trash;
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
  // 服務學校：建議清單來自管理者設定的學校，也可自行輸入（例如教育處）
  const schoolOptions = [...new Set([...SCHOOLS.map((s) => s.name), ...state.people.map((p) => p.school).filter(Boolean)])];
  const schoolList = h(
    'datalist',
    { id: 'school-options' },
    schoolOptions.map((s) => h('option', { value: s, label: schoolCounty(s) || null }))
  );
  const school = h('input', {
    required: true,
    maxlength: 40,
    list: 'school-options',
    placeholder: '例如：石榴國中',
    autocomplete: 'off',
    value: existing ? existing.school : state.schoolName,
  });
  // 清單中的學校：縣市自動帶入並鎖定；清單外的單位才自己選縣市
  const countyHint = h('small', { className: 'field-hint' });
  const syncCounty = () => {
    const known = schoolCounty(school.value.trim());
    county.disabled = Boolean(known);
    if (known) county.value = known;
    countyHint.textContent = known ? `已依學校設定自動帶入：${known}` : '';
  };
  school.addEventListener('input', syncCounty);
  syncCounty();
  const error = h('p', { className: 'form-error', role: 'alert', hidden: true });
  const cancel = h('button', { type: 'button', className: 'cancel-button', onClick: closeModal }, '取消');
  const save = h('button', { type: 'submit', className: 'submit-button' }, existing ? '儲存' : '加入名單');
  // 同名不同校時，伺服器要求使用者再確認一次
  let confirmDuplicate = false;
  const resetDuplicate = () => {
    if (!confirmDuplicate) return;
    confirmDuplicate = false;
    save.textContent = existing ? '儲存' : '加入名單';
    setError(error, '');
  };
  for (const el of [name, school, listSelect]) el.addEventListener('input', resetDuplicate);
  const form = h(
    'form',
    { className: 'login-form' },
    existing && h('label', {}, '名單', listSelect),
    h('label', {}, '姓名', name),
    h('label', {}, '身分', title),
    h('label', {}, '服務學校', school, schoolList),
    h('label', {}, '縣市', county, countyHint),
    error,
    h('div', { className: 'modal-actions' }, cancel, save)
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    modalBusy = true;
    save.disabled = cancel.disabled = true;
    try {
      const body = { role: existing ? listSelect.value : role, title: title.value, name: name.value, school: school.value, county: county.value };
      if (confirmDuplicate) body.confirmDuplicate = true;
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
      if (err.data?.duplicate) {
        confirmDuplicate = true;
        save.textContent = '確定是不同人，仍要加入';
      }
    }
  });
  openModal(
    existing ? `編輯${existing.role}` : `新增${role}`,
    existing ? '修改縣市、身分、姓名或服務學校；若放錯名單，可在「名單」改到另一邊。' : '輸入姓名、選擇身分與服務學校；清單中的學校會自動帶入縣市。',
    form
  );
  name.focus();
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
      state.trash = [{ ...p, deletedAt: new Date().toISOString() }, ...state.trash];
      closeModal();
      render();
      notify('已移至回收區，可隨時復原');
    } catch (err) {
      modalBusy = false;
      confirm.disabled = cancel.disabled = false;
      setError(error, err.message);
    }
  });
  openModal(
    `從${p.role}名單移除？`,
    `「${p.name}」會移至頁面下方的回收區，之後仍可復原。`,
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

const titleRank = (p) => (TEAM_TITLES.includes(p.title) ? TEAM_TITLES.indexOf(p.title) : TEAM_TITLES.length);
const byTitle = (a, b) =>
  titleRank(a) - titleRank(b) || (a.school || '').localeCompare(b.school || '', 'zh-Hant') || a.id - b.id;

async function restorePerson(p) {
  try {
    const restored = await api(`/api/team/${p.id}/restore`, { method: 'POST' });
    state.trash = state.trash.filter((x) => x.id !== p.id);
    state.people = [...state.people, restored];
    render();
    notify(`已復原 ${restored.name}`);
  } catch (err) {
    notify(err.message);
  }
}

function trashSection() {
  const details = h(
    'details',
    { open: state.trashOpen },
    h('summary', {}, '回收區 ', h('span', {}, `${state.trash.length} 筆`)),
    h('p', {}, state.role === 'owner' ? '已刪除的名單可在這裡復原。' : '您刪除的名單可在這裡復原。'),
    state.trash.length
      ? h(
          'div',
          { className: 'list' },
          state.trash.map((p) =>
            h(
              'div',
              { className: 'trash-row' },
              h('div', {}, h('strong', {}, p.name), h('span', {}, [p.role, p.county, p.title, p.school].filter(Boolean).join(' · '))),
              h('button', { className: 'restore-button', onClick: () => restorePerson(p) }, icon('rotate-ccw', 15), '復原')
            )
          )
        )
      : h('div', { className: 'trash-empty' }, '目前沒有已刪除的名單。')
  );
  details.addEventListener('toggle', () => (state.trashOpen = details.open));
  return details;
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
  const people = state.people.filter((p) => p.role === role).sort(byTitle);
  let body;
  if (state.loading) body = h('div', { className: 'trash-empty' }, '正在載入…');
  else if (state.loadError) body = h('div', { className: 'trash-empty' }, state.loadError);
  else if (SPLIT_ROLES.includes(role)) {
    // 雲林縣、嘉義縣左右兩欄，未選縣市的放在下方
    const column = (c) => {
      const group = people.filter((p) => p.county === c);
      return h(
        'div',
        { className: 'county-group' },
        h('h3', { className: 'county-title' }, c),
        group.length
          ? h('ul', { className: 'team-list' }, group.map((p) => personItem(p, role)))
          : h('p', { className: 'county-empty' }, '尚無')
      );
    };
    const unassigned = people.filter((p) => !TEAM_COUNTIES.includes(p.county));
    body = [
      h('div', { className: 'county-columns' }, TEAM_COUNTIES.map(column)),
      unassigned.length &&
        h(
          'div',
          { className: 'county-group' },
          h('h3', { className: 'county-title missing' }, '未選縣市'),
          h('ul', { className: 'team-list' }, unassigned.map((p) => personItem(p, role)))
        ),
    ];
  } else if (!people.length) body = h('div', { className: 'trash-empty' }, '尚未新增名單。');
  else
    body = [...TEAM_COUNTIES, ''].map((c) => {
      const group = people.filter((p) => (p.county || '') === c);
      if (!group.length) return null;
      return h(
        'div',
        { className: 'county-group' },
        h('h3', { className: c ? 'county-title' : 'county-title missing' }, c || '未選縣市'),
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
  const trash = $('team-trash');
  trash.hidden = !canEdit();
  if (canEdit()) trash.replaceChildren(trashSection());
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
  await loadSchools();
  render();
  await load();
}

init();
