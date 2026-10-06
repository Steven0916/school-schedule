'use strict';

// 公開觀課填報頁面（共用工具在 common.js）

const AI_MODES = ['AI備課', 'AI教學', 'AI評量', 'AI協作', 'AI創作', 'AI探究'];
const GRADES = { 7: '七年級', 8: '八年級', 9: '九年級' };
const gradeLabel = (g) => GRADES[g] || `${g} 年級`;
const classLabel = (o) => `${gradeLabel(o.grade)} ${o.className} 班 · ${o.students} 人`;
const periodLabel = (o) => `共 ${o.periods} 節，每節 ${o.minutes} 分鐘`;
const byObsDate = (a, b) => a.date.localeCompare(b.date) || a.id - b.id;

const state = {
  role: 'viewer',
  schoolName: '',
  username: '',
  records: [],
  loading: true,
  loadError: '',
};

const canEdit = () => state.role !== 'viewer';

async function load(initial = false) {
  if (initial) state.loading = true;
  try {
    state.records = (await api('/api/observations')).sort(byObsDate);
    state.loadError = '';
  } catch (err) {
    state.loadError = err.message;
  } finally {
    state.loading = false;
    render();
  }
}

// ---------- 詳細資訊 ----------

function openRecord(o) {
  const item = (label, value, cls) => h('div', { className: cls }, h('dt', {}, label), h('dd', {}, value));
  openModal(
    o.unit,
    `${o.subject} · 公開觀課資料`,
    h(
      'div',
      {},
      h(
        'dl',
        { className: 'event-detail-list' },
        item('日期', fmt(o.date)),
        item('領域/科目', o.subject),
        item('設計者', o.designer),
        item('班級', classLabel(o)),
        item('總節數與時間', periodLabel(o)),
        item('填報學校', o.createdBySchool || '管理者'),
        item('六大 AI 教學應用模式', h('div', { className: 'mode-chips' }, o.modes.map(modeChip)), 'event-detail-notes')
      ),
      o.canModify &&
        h(
          'div',
          { className: 'modal-actions' },
          h('button', { type: 'button', className: 'cancel-button', onClick: () => openDeleteRecord(o) }, '刪除'),
          h('button', { type: 'button', className: 'submit-button', onClick: () => openRecordForm(o) }, icon('pencil', 15), '編輯')
        )
    ),
    'event-detail-dialog'
  );
}

const modeChip = (m) => h('span', { className: 'mode-chip' }, m);

// ---------- 填報表單 ----------

function openRecordForm(existing) {
  const v = existing || { date: '', subject: '', designer: '', grade: '', className: '', students: '', periods: '', minutes: '', unit: '', modes: [] };

  const date = h('input', { type: 'date', required: true, value: v.date });
  const subject = h('input', { required: true, maxlength: 40, placeholder: '例如：自然科學／生物', value: v.subject });
  const designer = h('input', { required: true, maxlength: 80, placeholder: '例如：王小明', value: v.designer });
  const grade = h(
    'select',
    { className: 'form-select', required: true, 'aria-label': '年級', value: String(v.grade) },
    h('option', { value: '' }, '請選擇'),
    Object.entries(GRADES).map(([g, name]) => h('option', { value: g }, name))
  );
  const className = h('input', { required: true, maxlength: 20, placeholder: '例如：1', 'aria-label': '班級', value: v.className });
  const num = (value, min, max, label) =>
    h('input', { type: 'number', inputmode: 'numeric', required: true, min, max, step: 1, 'aria-label': label, value: String(value) });
  const students = num(v.students, 1, 200, '人數');
  const periods = num(v.periods, 1, 30, '總節數');
  const minutes = num(v.minutes, 1, 180, '每節分鐘數');
  const unit = h('input', { required: true, maxlength: 120, placeholder: '例如：生物的生殖', value: v.unit });
  const modeBoxes = AI_MODES.map((m) => h('input', { type: 'checkbox', value: m, checked: v.modes.includes(m) }));

  const error = h('p', { className: 'form-error', role: 'alert', hidden: true });
  const cancel = h('button', { type: 'button', className: 'cancel-button', onClick: closeModal }, '取消');
  const submit = h('button', { className: 'submit-button' }, '儲存填報');

  const label = (text) => h('div', { className: 'field-label' }, `${text} `, h('span', {}, '*'));
  const field = (text, control) => h('label', {}, label(text), control);

  const form = h(
    'form',
    { className: 'event-form observation-form' },
    field('日期', date),
    h('h3', { className: 'form-section' }, '基本資料'),
    h('div', { className: 'form-grid' }, field('領域/科目', subject), field('設計者', designer)),
    h(
      'fieldset',
      {},
      h('legend', {}, label('班級')),
      h(
        'div',
        { className: 'inline-row' },
        h('span', { className: 'inline-unit' }, '年級', grade),
        h('span', { className: 'inline-unit' }, '班級', className),
        h('span', { className: 'inline-unit' }, '人數', students)
      )
    ),
    h(
      'fieldset',
      {},
      h('legend', {}, label('總節數與時間')),
      h('div', { className: 'inline-row' }, h('span', { className: 'inline-unit' }, '共', periods, '節'), h('span', { className: 'inline-unit' }, '每節', minutes, '分鐘'))
    ),
    field('單元名稱', unit),
    h(
      'fieldset',
      {},
      h('legend', {}, h('div', { className: 'field-label' }, '六大 AI 教學應用模式 ', h('span', {}, '*'), h('small', {}, '可複選'))),
      h(
        'div',
        { className: 'mode-options' },
        modeBoxes.map((box) => h('label', { className: 'mode-option' }, box, box.value))
      )
    ),
    error,
    h('div', { className: 'form-actions' }, cancel, submit)
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setError(error, '');
    const modes = modeBoxes.filter((b) => b.checked).map((b) => b.value);
    if (!modes.length) {
      setError(error, '請至少勾選一項 AI 教學應用模式。');
      return;
    }
    const payload = {
      date: date.value,
      subject: subject.value,
      designer: designer.value,
      grade: Number(grade.value),
      className: className.value,
      students: Number(students.value),
      periods: Number(periods.value),
      minutes: Number(minutes.value),
      unit: unit.value,
      modes,
    };
    modalBusy = true;
    submit.disabled = cancel.disabled = true;
    submit.textContent = '儲存中…';
    try {
      const saved = await api(existing ? `/api/observations/${existing.id}` : '/api/observations', {
        method: existing ? 'PUT' : 'POST',
        body: payload,
      });
      state.records = existing
        ? state.records.map((r) => (r.id === existing.id ? saved : r)).sort(byObsDate)
        : [...state.records, saved].sort(byObsDate);
      closeModal();
      render();
      notify(existing ? '已更新觀課資料' : '已送出填報');
    } catch (err) {
      modalBusy = false;
      submit.disabled = cancel.disabled = false;
      submit.textContent = '儲存填報';
      setError(error, err.message);
    }
  });

  openModal(
    existing ? '編輯公開觀課資料' : '填報公開觀課',
    '所有欄位皆為必填；AI 教學應用模式可複選。',
    form,
    'form-dialog'
  );
  date.focus();
}

function openDeleteRecord(o) {
  openConfirmText({
    title: '刪除這筆觀課資料？',
    description: `「${o.subject}｜${o.unit}」將從清單移除。`,
    phrase: '確定刪除',
    confirmLabel: '確認刪除',
    busyLabel: '刪除中…',
    tone: 'danger',
    async onConfirm(confirmation) {
      await api(`/api/observations/${o.id}`, { method: 'DELETE', body: { confirmation } });
      state.records = state.records.filter((r) => r.id !== o.id);
      render();
      notify('已刪除觀課資料');
    },
  });
}

async function logout() {
  try {
    await api(state.role === 'owner' ? '/api/admin/logout' : '/api/schools/logout', { method: 'POST' });
    window.location.reload();
  } catch (err) {
    notify(err.message || '登出失敗');
  }
}

// ---------- 畫面 ----------

function recordRow(o) {
  return h(
    'article',
    { className: 'event-row' },
    h('div', { className: 'date-block' }, h('strong', {}, o.date.slice(8, 10)), h('span', {}, o.date.slice(0, 7).replace('-', '/'))),
    h(
      'div',
      { className: 'event-main' },
      h(
        'div',
        { className: 'event-heading' },
        h('span', { className: 'event-tag 觀課計畫' }, o.subject),
        h(
          'h3',
          {},
          h('button', { type: 'button', className: 'event-title-button', onClick: () => openRecord(o) }, o.unit)
        )
      ),
      h(
        'div',
        { className: 'event-facts' },
        h('span', {}, h('strong', {}, '設計者'), o.designer),
        h('span', {}, h('strong', {}, '班級'), classLabel(o)),
        h('span', {}, h('strong', {}, '節數'), periodLabel(o)),
        o.createdBySchool && h('span', {}, h('strong', {}, '學校'), o.createdBySchool)
      )
    ),
    o.canModify &&
      h(
        'div',
        { className: 'row-actions' },
        h('button', { className: 'edit-button', onClick: () => openRecordForm(o) }, icon('pencil', 17), h('span', {}, '編輯')),
        h(
          'button',
          { className: 'delete-button', 'aria-label': `刪除「${o.unit}」`, title: '刪除', onClick: () => openDeleteRecord(o) },
          icon('trash', 18)
        )
      )
  );
}

function render() {
  const dash = state.loading;

  $('intro-actions').replaceChildren(
    canEdit()
      ? h('button', { className: 'add-button', onClick: () => openRecordForm(null) }, icon('plus', 19), '填報公開觀課')
      : h(
          'div',
          { className: 'login-links' },
          h('a', { className: 'add-button', href: '/school/login?next=/observations' }, '學校端登入填報'),
          h('a', { className: 'school-login-link', href: '/admin/login?next=/observations' }, '管理者登入')
        )
  );

  const banner = $('access-banner');
  if (state.role === 'owner') banner.replaceChildren(h('span', {}, '管理者帳號'), h('button', { onClick: logout }, '登出'));
  else if (state.role === 'school')
    banner.replaceChildren(h('span', {}, `學校端 · ${state.schoolName} · ${state.username}`), h('button', { onClick: logout }, '登出'));
  else banner.replaceChildren(h('span', {}, '公開瀏覽 · 設計者姓名已部分隱藏，登入後可看完整資料並填報。'));

  const shown = state.records;
  $('record-count').textContent = dash ? '' : `${shown.length} 筆`;
  const list = $('record-list');
  if (dash) list.replaceChildren(h('div', { className: 'empty-state' }, h('p', {}, '正在載入…')));
  else if (state.loadError)
    list.replaceChildren(
      h(
        'div',
        { className: 'empty-state' },
        h('p', {}, state.loadError),
        h('button', { className: 'text-button', onClick: () => load(true) }, '重新載入')
      )
    );
  else if (shown.length) list.replaceChildren(...shown.map(recordRow));
  else
    list.replaceChildren(
      h(
        'div',
        { className: 'empty-state' },
        h('div', { className: 'empty-icon' }, icon('eye', 28)),
        h('h3', {}, '尚無公開觀課資料'),
        h('p', {}, '填報後會顯示在這裡。'),
        canEdit() && h('button', { className: 'empty-add', onClick: () => openRecordForm(null) }, icon('plus', 17), '填報公開觀課')
      )
    );
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
  await load(true);
}

init();
