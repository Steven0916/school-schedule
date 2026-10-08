'use strict';

const CATEGORIES = ['會議', '工作', '觀課計畫', '重要行事'];
const LOCATIONS = ['線上會議', '石榴國中', '東榮國中', '永慶高中'];

// ---------- 狀態 ----------

const state = {
  role: 'viewer',
  schoolName: '',
  username: '',
  events: [],
  trash: [],
  loading: true,
  loadError: '',
  refreshError: '',
  statusError: '',
  lastUpdated: '',
  filter: '全部',
  today: todayTaipei(),
  busyId: null,
  trashOpen: false,
};

const isOwner = () => state.role === 'owner';
const canEdit = () => state.role !== 'viewer';

function derived() {
  const active = state.events.filter((e) => !e.completedAt && endOf(e) >= state.today);
  const overdue = state.events
    .filter((e) => !e.completedAt && endOf(e) < state.today)
    .sort((a, b) => endOf(b).localeCompare(endOf(a)));
  const pending = [...overdue, ...active];
  const filtered = pending.filter((e) => state.filter === '全部' || e.category === state.filter);
  const completed = state.events
    .filter((e) => e.completedAt)
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  return { pending, filtered, completed };
}

// ---------- 資料載入 ----------

async function load(initial = false) {
  if (initial) {
    state.loading = true;
    state.loadError = '';
    render();
  }
  try {
    const [events, trash] = await Promise.all([
      api('/api/events'),
      canEdit() ? api('/api/events/trash') : Promise.resolve([]),
    ]);
    state.events = events.sort(byDate);
    state.trash = trash;
    state.refreshError = '';
    auditRefresh();
    state.lastUpdated = new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Taipei',
    });
  } catch (err) {
    if (initial) state.loadError = err.message;
    else state.refreshError = `更新清單失敗：${err.message}`;
  } finally {
    if (initial) state.loading = false;
    render();
  }
}

// 詳細資訊
function openDetail(e) {
  const status = e.completedAt ? '已確認完成' : endOf(e) < state.today ? '已過期，待確認' : '待進行';
  const item = (label, value, cls) => h('div', { className: cls }, h('dt', {}, label), h('dd', {}, value));
  openModal(
    e.title,
    `${e.category} · 期程詳細資訊`,
    h(
      'dl',
      { className: 'event-detail-list' },
      item('日期', `${fmt(e.startDate)}${e.endDate && e.endDate !== e.startDate ? ` — ${fmt(e.endDate)}` : ''}`),
      item('時間', e.time || '未填寫'),
      item('主辦', e.owner || '未填寫'),
      item('地點', e.location || '未填寫'),
      item('建立學校', e.createdBySchool || '管理者'),
      item('狀態', status),
      item('備註', e.notes || '無', 'event-detail-notes')
    ),
    'event-detail-dialog'
  );
}

// 新增／編輯期程
function openEventForm(existing, category = '會議') {
  const v = existing
    ? { ...existing }
    : { title: '', category, startDate: '', endDate: '', time: '', location: '', owner: '', notes: '' };

  const title = h('input', { name: 'title', maxlength: 120, placeholder: '例如：教學共備會議', required: true, value: v.title });
  const cat = h(
    'select',
    { name: 'category', className: 'form-select', 'aria-label': '類別', value: v.category },
    CATEGORIES.map((c) => h('option', { value: c }, c))
  );
  const start = h('input', { type: 'date', name: 'startDate', required: true, value: v.startDate });
  const end = h('input', { type: 'date', name: 'endDate', min: v.startDate || null, value: v.endDate || '' });
  start.addEventListener('change', () => (end.min = start.value));
  const time = h('input', { type: 'time', name: 'time', value: v.time || '' });
  const owner = h('input', { name: 'owner', maxlength: 80, placeholder: '例如：教務處', value: v.owner || '' });
  const location = h(
    'select',
    { name: 'location', className: 'form-select', value: v.location || '' },
    h('option', { value: '' }, '請選擇地點'),
    LOCATIONS.map((l) => h('option', { value: l }, l))
  );
  const notes = h('textarea', { name: 'notes', maxlength: 500, rows: 3, placeholder: '補充準備事項等', value: v.notes || '' });
  const error = h('p', { className: 'form-error', role: 'alert', hidden: true });
  const cancel = h('button', { type: 'button', className: 'cancel-button', onClick: closeModal }, '取消');
  const submit = h('button', { className: 'submit-button' }, '儲存期程');

  const field = (text, isRequired, control) =>
    h(
      'label',
      {},
      h('div', { className: 'field-label' }, `${text} `, isRequired ? h('span', {}, '*') : h('small', {}, '選填')),
      control
    );

  const form = h(
    'form',
    { className: 'event-form' },
    field('項目名稱', true, title),
    field('類別', true, cat),
    h('div', { className: 'form-grid' }, field('開始日期', true, start), field('結束日期', false, end)),
    h('div', { className: 'form-grid' }, field('時間', false, time), field('主辦（負責人或單位）', false, owner)),
    field('地點', false, location),
    field('備註', false, notes),
    error,
    h('div', { className: 'form-actions' }, cancel, submit)
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setError(error, '');
    const payload = {
      title: title.value,
      category: cat.value,
      startDate: start.value,
      endDate: end.value,
      time: time.value,
      location: location.value,
      owner: owner.value,
      notes: notes.value,
    };
    if (payload.endDate && payload.endDate < payload.startDate) {
      setError(error, '結束日期不能早於開始日期。');
      return;
    }
    modalBusy = true;
    submit.disabled = cancel.disabled = true;
    submit.textContent = '儲存中…';
    try {
      const saved = await api(existing ? `/api/events/${existing.id}` : '/api/events', {
        method: existing ? 'PUT' : 'POST',
        body: payload,
      });
      state.events = existing
        ? state.events.map((e) => (e.id === existing.id ? saved : e)).sort(byDate)
        : [...state.events, saved].sort(byDate);
      closeModal();
      render();
      notify(existing ? '已更新期程' : '已新增期程');
      load();
    } catch (err) {
      modalBusy = false;
      submit.disabled = cancel.disabled = false;
      submit.textContent = '儲存期程';
      setError(error, err.message);
    }
  });

  openModal(
    existing ? '編輯期程' : '新增期程',
    existing
      ? '修改內容或日期後儲存；過期項目改到未來日期後會回到期程清單。'
      : '填寫安排的基本資訊，儲存後會顯示在清單中。',
    form,
    'form-dialog'
  );
  title.focus();
}


function openDelete(e) {
  openConfirmText({
    title: '刪除這筆期程？',
    description: `「${e.title}」會移至回收區，之後仍可復原。`,
    phrase: '確定刪除',
    confirmLabel: '確認刪除',
    busyLabel: '移動中…',
    tone: 'danger',
    async onConfirm(confirmation) {
      await api(`/api/events/${e.id}`, { method: 'DELETE', body: { confirmation } });
      state.events = state.events.filter((x) => x.id !== e.id);
      render();
      notify('已移至回收區，可隨時復原');
      load();
    },
  });
}

function openRestore(e) {
  openConfirmText({
    title: '復原這筆期程？',
    description: `「${e.title}」會從回收區復原，並依原本狀態顯示在清單中。`,
    phrase: '確定復原',
    confirmLabel: '確認復原',
    busyLabel: '復原中…',
    tone: 'success',
    async onConfirm(confirmation) {
      const restored = await api(`/api/events/${e.id}/restore`, { method: 'POST', body: { confirmation } });
      state.trash = state.trash.filter((x) => x.id !== e.id);
      state.events = [...state.events, restored].sort(byDate);
      render();
      notify('期程已復原');
      load();
    },
  });
}

async function setCompleted(e, completed) {
  state.busyId = e.id;
  state.statusError = '';
  render();
  try {
    const updated = await api(`/api/events/${e.id}`, { method: 'PATCH', body: { completed } });
    state.events = state.events.map((x) => (x.id === e.id ? { ...x, completedAt: updated.completedAt } : x));
    notify(completed ? '已確認完成' : '已取消完成標記');
    load();
  } catch (err) {
    state.statusError = err.message;
  } finally {
    state.busyId = null;
    render();
  }
}

async function logout() {
  try {
    await api(isOwner() ? '/api/admin/logout' : '/api/schools/logout', { method: 'POST' });
    window.location.reload();
  } catch (err) {
    state.statusError = err.message || '登出失敗';
    render();
  }
}

// ---------- 畫面 ----------

function eventRow(e, kind) {
  const days = (Date.parse(e.startDate) - Date.parse(state.today)) / 864e5;
  const upcoming = kind === 'active' && days >= 0 && days <= 14;
  const rowClass =
    kind === 'completed' ? 'completed-row' : kind === 'overdue' ? 'overdue-row' : upcoming ? 'upcoming-row' : '';
  const busy = state.busyId === e.id;

  const left =
    kind === 'completed'
      ? h('div', { className: 'completed-check' }, icon('check', 20))
      : h(
          'div',
          { className: 'date-block' },
          h('strong', {}, e.startDate.slice(8, 10)),
          h('span', {}, e.startDate.slice(0, 7).replace('-', '/'))
        );

  const meta =
    (kind === 'active' ? '' : '原訂 ') +
    fmt(e.startDate) +
    (e.endDate && e.endDate !== e.startDate ? ` — ${fmt(e.endDate)}` : '') +
    (e.time ? ` · ${e.time}` : '') +
    (kind === 'completed' ? ' · 已確認完成' : '');

  const main = h(
    'div',
    { className: 'event-main' },
    h(
      'div',
      { className: 'event-heading' },
      h('span', { className: `event-tag ${e.category}` }, icon(CATEGORY_ICON[e.category], 14), e.category),
      h(
        'h3',
        {},
        h(
          'button',
          {
            type: 'button',
            className: 'event-title-button',
            'aria-label': `查看「${e.title}」的詳細資訊`,
            onClick: () => openDetail(e),
          },
          e.title
        )
      ),
      kind === 'overdue' && h('span', { className: 'overdue-tag' }, '已過期'),
      upcoming && h('span', { className: 'upcoming-tag' }, '即將到期')
    ),
    h('p', { className: 'event-meta' }, meta),
    h(
      'div',
      { className: 'event-facts' },
      h('span', {}, h('strong', {}, '主辦'), e.owner || '未填寫'),
      h('span', {}, h('strong', {}, '地點'), e.location || '未填寫')
    ),
    h(
      'button',
      { type: 'button', className: 'event-details-button', onClick: () => openDetail(e) },
      '查看資訊 ',
      icon('chevron-right', 15)
    )
  );

  let actions = null;
  if (isOwner() || e.canDelete) {
    actions = h(
      'div',
      { className: 'row-actions' },
      isOwner() &&
        (kind === 'completed'
          ? h(
              'button',
              { className: 'restore-button', disabled: busy, onClick: () => setCompleted(e, false) },
              icon('rotate-ccw', 15),
              busy ? '更新中…' : '取消完成'
            )
          : h(
              'button',
              { className: 'complete-button', disabled: busy, onClick: () => setCompleted(e, true) },
              icon('check', 16),
              busy ? '更新中…' : '確認完成'
            )),
      isOwner() &&
        h(
          'button',
          {
            className: 'edit-button',
            'aria-label': `編輯「${e.title}」`,
            title: kind === 'overdue' ? '編輯或重新排程' : '編輯期程',
            onClick: () => openEventForm(e),
          },
          icon('pencil', 17),
          h('span', {}, kind === 'overdue' ? '重新排程' : '編輯')
        ),
      e.canDelete &&
        h(
          'button',
          { className: 'delete-button', 'aria-label': `刪除「${e.title}」`, title: '移至回收區', onClick: () => openDelete(e) },
          icon('trash', 18)
        )
    );
  }

  return h('article', { className: `event-row ${rowClass}` }, left, main, actions);
}

function renderHeaderParts() {
  $('intro-actions').replaceChildren(
    canEdit()
      ? h('button', { className: 'add-button', onClick: () => openEventForm(null) }, icon('plus', 19), '新增期程')
      : h(
          'div',
          { className: 'login-links' },
          h('a', { className: 'add-button', href: '/admin/login' }, '管理者登入'),
          h('a', { className: 'school-login-link', href: '/school/login' }, '學校端登入')
        )
  );

  const banner = $('access-banner');
  if (isOwner()) {
    banner.replaceChildren(h('span', {}, '管理者帳號'), h('button', { onClick: logout }, '登出'));
  } else if (state.role === 'school') {
    banner.replaceChildren(
      h('span', {}, `學校端 · ${state.schoolName} · ${state.username}`),
      h('button', { onClick: logout }, '登出')
    );
  } else {
    banner.replaceChildren(h('span', {}, '公開瀏覽 · 管理者與學校端使用各自的登入入口。'));
  }

  $('filters').replaceChildren(
    ...['全部', ...CATEGORIES].map((c) =>
      h(
        'button',
        {
          'aria-pressed': String(state.filter === c),
          className: state.filter === c ? 'filter active' : 'filter',
          onClick: () => {
            state.filter = c;
            render();
          },
        },
        c === '全部' && icon('layout-grid', 16),
        c
      )
    )
  );
}

function render() {
  const { pending, filtered, completed } = derived();
  const dash = state.loading;

  // 統計
  $('overview').replaceChildren(
    h(
      'div',
      { className: 'overview-primary' },
      h('span', {}, '待處理期程'),
      h('strong', {}, dash ? '—' : String(pending.length).padStart(2, '0')),
      h('small', {}, '含已過期、尚未確認的項目')
    ),
    ...CATEGORIES.map((c) =>
      h(
        'div',
        { className: 'overview-cell' },
        h('div', { className: `category-icon ${c}` }, icon(CATEGORY_ICON[c], 19)),
        h('span', {}, c),
        h('strong', {}, dash ? '—' : String(pending.filter((e) => e.category === c).length))
      )
    )
  );

  renderHeaderParts();

  // 期程清單
  $('schedule-count').textContent = dash ? '' : `${filtered.length} 筆`;
  $('last-updated').textContent = state.lastUpdated ? ` · ${state.lastUpdated}` : '';
  const list = $('schedule-list');
  if (dash) {
    list.replaceChildren(h('div', { className: 'empty-state' }, h('p', {}, '正在載入期程…')));
  } else if (state.loadError) {
    list.replaceChildren(
      h(
        'div',
        { className: 'empty-state' },
        h('p', {}, state.loadError),
        h('button', { className: 'text-button', onClick: () => load(true) }, '重新載入')
      )
    );
  } else if (filtered.length) {
    list.replaceChildren(...filtered.map((e) => eventRow(e, endOf(e) < state.today ? 'overdue' : 'active')));
  } else {
    list.replaceChildren(
      h(
        'div',
        { className: 'empty-state' },
        h('div', { className: 'empty-icon' }, icon('calendar-days', 28)),
        h('h3', {}, '目前沒有待處理期程'),
        h('p', {}, '新增期程後，會顯示在這裡。'),
        canEdit() &&
          h(
            'button',
            {
              className: 'empty-add',
              onClick: () => openEventForm(null, state.filter === '全部' ? '會議' : state.filter),
            },
            icon('plus', 17),
            '新增期程'
          )
      )
    );
  }

  // 已完成
  $('completed-count').textContent = dash ? '' : `${completed.length} 筆`;
  const compact = (text) => h('div', { className: 'empty-state compact' }, h('p', {}, text));
  $('completed-list').replaceChildren(
    ...(dash
      ? [compact('正在載入…')]
      : state.loadError
        ? [compact('暫時無法載入。')]
        : completed.length
          ? completed.map((e) => eventRow(e, 'completed'))
          : [compact('尚無已確認完成的項目。')])
  );

  // 回收區
  const trashSection = $('trash-section');
  trashSection.hidden = !canEdit();
  if (canEdit()) {
    const details = h(
      'details',
      { open: state.trashOpen },
      h('summary', {}, '回收區 ', h('span', {}, `${state.trash.length} 筆`)),
      h('p', {}, isOwner() ? '已刪除的期程可在這裡復原。' : '您刪除的期程可在這裡復原。'),
      state.trash.length
        ? h(
            'div',
            { className: 'list' },
            state.trash.map((e) =>
              h(
                'div',
                { className: 'trash-row' },
                h('div', {}, h('strong', {}, e.title), h('span', {}, `${e.category} · 原訂 ${fmt(e.startDate)}`)),
                h('button', { className: 'restore-button', onClick: () => openRestore(e) }, icon('rotate-ccw', 15), '復原')
              )
            )
          )
        : h('div', { className: 'trash-empty' }, '目前沒有已刪除的期程。')
    );
    details.addEventListener('toggle', () => (state.trashOpen = details.open));
    trashSection.replaceChildren(details);
  }

  // 錯誤訊息
  const status = $('status-error');
  status.textContent = state.statusError || state.refreshError;
  status.hidden = !status.textContent;
}

// ---------- 帳號與權限（管理者） ----------

function mountSchoolAccess() {
  let members = [];
  const summaryCount = h('span', {}, '0 個學校帳號');
  const errorEl = h('p', { className: 'form-error', role: 'alert', hidden: true });
  const okEl = h('p', { role: 'status', hidden: true });
  const listEl = h('div');

  const setMsg = (error, ok = '') => {
    setError(errorEl, error);
    okEl.textContent = ok;
    okEl.hidden = !ok;
  };

  // 已顯示的密碼（id → 密碼），只存在目前頁面
  const revealed = new Map();

  async function togglePassword(m) {
    if (revealed.has(m.id)) {
      revealed.delete(m.id);
      renderMembers();
      return;
    }
    setMsg('');
    try {
      const { password } = await api(`/api/schools/members/${m.id}/password`);
      revealed.set(m.id, password);
      renderMembers();
    } catch (err) {
      setMsg(err.message || '無法顯示密碼');
    }
  }

  function passwordCell(m) {
    if (!m.passwordViewable) {
      return h('span', { className: 'member-password' }, '密碼：無法顯示（舊帳號，按「編輯」設定新密碼後即可查看）');
    }
    const shown = revealed.has(m.id);
    return h(
      'span',
      { className: 'member-password' },
      '密碼：',
      h('code', {}, shown ? revealed.get(m.id) : '••••••'),
      h(
        'button',
        {
          type: 'button',
          className: 'text-link',
          'aria-label': `${shown ? '隱藏' : '顯示'} ${m.username} 的密碼`,
          onClick: () => togglePassword(m),
        },
        shown ? '隱藏' : '顯示'
      )
    );
  }

  function renderMembers() {
    summaryCount.textContent = `${members.length} 個學校帳號`;
    listEl.replaceChildren(
      members.length
        ? h(
            'div',
            { className: 'member-list' },
            members.map((m) =>
              h(
                'div',
                { className: 'member-row' },
                h('div', {}, h('strong', {}, m.schoolName), h('span', {}, `帳號：${m.username}`), passwordCell(m)),
                h(
                  'div',
                  { className: 'account-actions' },
                  h(
                    'button',
                    { type: 'button', className: 'edit-button', 'aria-label': `編輯 ${m.username}`, onClick: () => openEditMember(m) },
                    icon('pencil', 16),
                    h('span', {}, '編輯')
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'delete-button',
                      title: '移除帳號',
                      'aria-label': `移除 ${m.username}`,
                      onClick: () => openRemoveMember(m),
                    },
                    icon('trash', 18)
                  )
                )
              )
            )
          )
        : h('div', { className: 'trash-empty' }, '尚未建立學校端帳號。')
    );
  }

  // 建立學校帳號
  const schoolName = h('input', { required: true, maxlength: 80, placeholder: '例如：石榴國中' });
  const username = h('input', {
    required: true,
    minlength: 3,
    maxlength: 40,
    pattern: '[a-zA-Z0-9._-]+',
    autocomplete: 'off',
    placeholder: '例如：school01',
  });
  const password = h('input', {
    required: true,
    type: 'text',
    minlength: 6,
    maxlength: 128,
    autocomplete: 'new-password',
    placeholder: '至少 6 個字元',
  });
  const createBtn = h('button', { className: 'submit-button' }, icon('plus', 16), '建立帳號');
  const createForm = h(
    'form',
    { className: 'school-form' },
    h('label', {}, '學校名稱', schoolName),
    h('label', {}, '學校端帳號', username),
    h('label', {}, '登入密碼', password),
    createBtn
  );
  createForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    createBtn.disabled = true;
    setMsg('');
    try {
      const m = await api('/api/schools/members', {
        method: 'POST',
        body: { schoolName: schoolName.value, username: username.value, password: password.value },
      });
      members = [...members, m].sort(
        (a, b) => a.schoolName.localeCompare(b.schoolName) || a.username.localeCompare(b.username)
      );
      createForm.reset();
      renderMembers();
      setMsg('', '已建立學校帳號。');
    } catch (err) {
      setMsg(err.message || '新增失敗');
    } finally {
      createBtn.disabled = false;
    }
  });

  // 修改管理者帳密
  const adminUser = h('input', { required: true, minlength: 3, maxlength: 40, pattern: '[a-zA-Z0-9._-]+', value: 'admin' });
  const currentPw = h('input', { required: true, type: 'password', autocomplete: 'current-password' });
  const newPw = h('input', { required: true, type: 'password', minlength: 9, maxlength: 128, autocomplete: 'new-password' });
  const credBtn = h('button', { className: 'submit-button' }, '儲存並重新登入');
  const credForm = h(
    'form',
    { className: 'school-form' },
    h('label', {}, '新帳號', adminUser),
    h('label', {}, '目前密碼', currentPw),
    h('label', {}, '新密碼', newPw),
    credBtn
  );
  credForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    credBtn.disabled = true;
    setMsg('');
    try {
      await api('/api/admin/credentials', {
        method: 'PUT',
        body: { username: adminUser.value, currentPassword: currentPw.value, password: newPw.value },
      });
      window.location.replace('/admin/login');
    } catch (err) {
      setMsg(err.message || '更新失敗');
    } finally {
      credBtn.disabled = false;
      currentPw.value = '';
      newPw.value = '';
    }
  });

  // 編輯學校帳號：學校名稱、帳號、密碼
  async function openEditMember(m) {
    const name = h('input', { required: true, maxlength: 80, value: m.schoolName });
    const user = h('input', {
      required: true,
      minlength: 3,
      maxlength: 40,
      pattern: '[a-zA-Z0-9._-]+',
      autocomplete: 'off',
      value: m.username,
    });
    const pw = h('input', { type: 'text', minlength: 6, maxlength: 128, autocomplete: 'off', placeholder: '留空表示不變更' });
    const current = h('p', { className: 'field-hint' });
    const error = h('p', { className: 'form-error', role: 'alert', hidden: true });
    const cancel = h('button', { type: 'button', className: 'cancel-button', onClick: closeModal }, '取消');
    const save = h('button', { type: 'submit', className: 'submit-button' }, '儲存');
    const form = h(
      'form',
      { className: 'login-form' },
      h('label', {}, '學校名稱', name),
      h('label', {}, '學校端帳號', user),
      h('label', {}, '新密碼（至少 6 個字元）', pw),
      current,
      error,
      h('div', { className: 'modal-actions' }, cancel, save)
    );
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      modalBusy = true;
      save.disabled = cancel.disabled = true;
      try {
        const body = { schoolName: name.value, username: user.value };
        if (pw.value) body.password = pw.value;
        const updated = await api(`/api/schools/members/${m.id}`, { method: 'PATCH', body });
        members = members
          .map((x) => (x.id === m.id ? updated : x))
          .sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.username.localeCompare(b.username));
        if (pw.value) revealed.set(m.id, pw.value);
        renderMembers();
        closeModal();
        const relogin = pw.value || user.value !== m.username;
        setMsg('', `已更新 ${updated.username}${relogin ? '，該帳號原有登入已失效。' : '。'}`);
      } catch (err) {
        modalBusy = false;
        save.disabled = cancel.disabled = false;
        setError(error, err.message || '更新失敗');
      }
    });
    openModal(`編輯 ${m.schoolName}`, '修改帳號或密碼後，該帳號原有登入會立即失效。', form);
    name.focus();
    if (!m.passwordViewable) {
      current.textContent = '目前密碼無法顯示（舊帳號），設定新密碼後即可查看。';
      return;
    }
    current.textContent = '目前密碼：讀取中…';
    try {
      const { password } = await api(`/api/schools/members/${m.id}/password`);
      current.textContent = `目前密碼：${password}`;
    } catch (err) {
      current.textContent = err.message;
    }
  }

  function openRemoveMember(m) {
    const error = h('p', { className: 'form-error', role: 'alert', hidden: true });
    const cancel = h('button', { type: 'button', className: 'cancel-button', onClick: closeModal }, '取消');
    const confirm = h('button', { type: 'button', className: 'danger-button' }, '確認移除');
    confirm.addEventListener('click', async () => {
      modalBusy = true;
      confirm.disabled = cancel.disabled = true;
      try {
        await api(`/api/schools/members/${m.id}`, { method: 'DELETE' });
        members = members.filter((x) => x.id !== m.id);
        renderMembers();
        closeModal();
        setMsg('', '帳號已移除。');
      } catch (err) {
        modalBusy = false;
        confirm.disabled = cancel.disabled = false;
        setError(error, err.message || '移除失敗');
      }
    });
    openModal(
      '移除學校端帳號？',
      `${m.username} 將無法再登入；既有期程會保留。`,
      h('div', {}, error, h('div', { className: 'modal-actions' }, cancel, confirm))
    );
  }

  $('school-access').replaceChildren(
    h(
      'section',
      { className: 'school-access' },
      h(
        'details',
        {},
        h('summary', {}, '帳號與權限 ', summaryCount),
        h('p', {}, '設定學校端帳號及密碼，可隨時查看與修改。每個帳號可以新增期程，只能刪除自己新增的項目。修改帳號、密碼或移除帳號後，該帳號現有登入即失效。'),
        createForm,
        errorEl,
        okEl,
        listEl,
        h('details', { className: 'admin-credentials' }, h('summary', {}, '修改管理者帳號密碼'), credForm)
      )
    )
  );
  renderMembers();

  Promise.all([api('/api/schools/members'), api('/api/admin/credentials')])
    .then(([list, cred]) => {
      members = list;
      adminUser.value = cred.username;
      renderMembers();
    })
    .catch((err) => setMsg(err.message || '載入失敗'));
}

// ---------- 操作紀錄（管理者） ----------

function mountAuditLog() {
  const section = $('audit-section');
  const count = h('span', {}, '');
  let listEl = h('div', { className: 'trash-empty' }, '展開後載入…');
  const details = h(
    'details',
    {},
    h('summary', {}, '操作紀錄 ', count),
    h('p', {}, '記錄期程、公開觀課填報、計畫成員與帳號的變更，顯示最近 200 筆。'),
    listEl
  );

  async function refresh() {
    try {
      const rows = await api('/api/admin/audit');
      count.textContent = `${rows.length} 筆`;
      const when = (iso) =>
        new Date(iso).toLocaleString('zh-TW', {
          timeZone: 'Asia/Taipei',
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      listEl.replaceWith(
        (listEl = rows.length
          ? h(
              'div',
              { className: 'list' },
              rows.map((r) =>
                h(
                  'div',
                  { className: 'trash-row' },
                  h('div', {}, h('strong', {}, `${r.action}${r.detail ? `：${r.detail}` : ''}`), h('span', {}, `${when(r.at)} · ${r.actor}`))
                )
              )
            )
          : h('div', { className: 'trash-empty' }, '目前沒有紀錄。'))
      );
    } catch (err) {
      count.textContent = '';
      listEl.textContent = err.message;
    }
  }

  details.addEventListener('toggle', () => details.open && refresh());
  auditRefresh = () => details.open && refresh();
  section.replaceChildren(details);
  section.hidden = false;
}

let auditRefresh = () => {};

// ---------- 啟動 ----------

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

  if (isOwner()) {
    mountSchoolAccess();
    mountAuditLog();
  }
  $('refresh-button').addEventListener('click', () => load());

  await load(true);
  // 從左側選單連過來時（/#completed 等），資料載入後版面變高，需重新捲到該區塊
  const target = location.hash && $(location.hash.slice(1));
  if (target) target.scrollIntoView();

  const tick = () => {
    state.today = todayTaipei();
    load();
  };
  setInterval(tick, 45_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

init();
