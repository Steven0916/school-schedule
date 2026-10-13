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
      filesSection(o),
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

// ---------- 附件 ----------

const FILE_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp'];
const MAX_FILE_MB = 10;
const MAX_FILES = 10;
const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function updateRecord(o) {
  state.records = state.records.map((r) => (r.id === o.id ? o : r));
  render();
}

// 詳細資訊裡的附件區；上傳／刪除後就地更新
function filesSection(o) {
  const box = h('section', { className: 'files-box' });
  const status = h('p', { className: 'form-error', role: 'alert', hidden: true });

  const draw = () => {
    if (!canEdit()) {
      box.replaceChildren(
        h('h3', {}, icon('paperclip', 16), '附件'),
        h('p', { className: 'files-hint' }, o.fileCount ? `共 ${o.fileCount} 個附件，登入後可查看。` : '沒有附件。')
      );
      return;
    }
    const picker = h('input', {
      type: 'file',
      multiple: true,
      hidden: true,
      accept: FILE_EXTS.map((e) => `.${e}`).join(','),
    });
    picker.addEventListener('change', () => upload([...picker.files]));
    box.replaceChildren(
      h('h3', {}, icon('paperclip', 16), '附件', h('span', {}, `${o.files.length} 個`)),
      o.files.length
        ? h(
            'ul',
            { className: 'file-list' },
            o.files.map((f) =>
              h(
                'li',
                {},
                h(
                  'a',
                  { href: `/api/observation-files/${f.id}`, target: '_blank', rel: 'noopener' },
                  icon('download', 15),
                  h('span', {}, f.name)
                ),
                h('small', {}, fileSize(f.size)),
                o.canModify &&
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'delete-button',
                      title: '刪除附件',
                      'aria-label': `刪除附件 ${f.name}`,
                      onClick: () => removeFile(f),
                    },
                    icon('trash', 15)
                  )
              )
            )
          )
        : h('p', { className: 'files-hint' }, '尚未上傳附件。'),
      o.canModify &&
        h(
          'div',
          { className: 'files-upload' },
          picker,
          h(
            'button',
            { type: 'button', className: 'empty-add', disabled: o.files.length >= MAX_FILES, onClick: () => picker.click() },
            icon('upload', 16),
            '上傳附件'
          ),
          h('small', {}, `PDF、圖片、Office 文件，每個最多 ${MAX_FILE_MB} MB，最多 ${MAX_FILES} 個。只有登入者看得到附件。`)
        ),
      status
    );
  };

  async function upload(files) {
    setError(status, '');
    for (const file of files) {
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
      if (!FILE_EXTS.includes(ext)) {
        setError(status, `「${file.name}」格式不支援。只接受 PDF、圖片與 Office 文件。`);
        continue;
      }
      if (file.size > MAX_FILE_MB * 1048576) {
        setError(status, `「${file.name}」超過 ${MAX_FILE_MB} MB。`);
        continue;
      }
      if (o.files.length >= MAX_FILES) {
        setError(status, `每筆觀課最多 ${MAX_FILES} 個附件。`);
        break;
      }
      box.querySelector('.files-upload button').textContent = `上傳中：${file.name}…`;
      try {
        const res = await fetch(`/api/observations/${o.id}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
          body: file,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '上傳失敗，請稍後重試。');
        o = { ...o, files: [...o.files, data], fileCount: o.fileCount + 1 };
        updateRecord(o);
      } catch (err) {
        setError(status, `「${file.name}」：${err.message}`);
      }
    }
    const msg = status.hidden ? '' : status.textContent;
    draw();
    setError(status, msg);
  }

  async function removeFile(f) {
    setError(status, '');
    try {
      await api(`/api/observation-files/${f.id}`, { method: 'DELETE' });
      o = { ...o, files: o.files.filter((x) => x.id !== f.id), fileCount: o.fileCount - 1 };
      updateRecord(o);
      draw();
      notify(`已刪除附件 ${f.name}`);
    } catch (err) {
      setError(status, err.message);
    }
  }

  draw();
  return box;
}

// ---------- 匯出 Excel ----------

function exportRecords() {
  const rows = state.records.map((o) => [
    o.date,
    o.createdBySchool || '管理者',
    o.subject,
    o.designer,
    gradeLabel(o.grade),
    o.className,
    o.students,
    o.periods,
    o.minutes,
    o.unit,
    ...AI_MODES.map((m) => (o.modes.includes(m) ? '✓' : '')),
    o.fileCount,
  ]);
  const headers = ['日期', '填報學校', '領域/科目', '設計者', '年級', '班級', '人數', '總節數', '每節分鐘', '單元名稱', ...AI_MODES, '附件數'];
  downloadXlsx(`公開觀課紀錄_${todayTaipei()}.xlsx`, '公開觀課紀錄', headers, rows);
}

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
      notify(existing ? '已更新觀課資料' : '已送出填報，並已加入期程清單');
      // 新填報的直接打開詳細資訊，方便接著上傳附件
      if (!existing) openRecord(saved);
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
        o.createdBySchool && h('span', {}, h('strong', {}, '學校'), o.createdBySchool),
        o.fileCount > 0 && h('span', { className: 'file-count' }, icon('paperclip', 14), `${o.fileCount} 個附件`)
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
      ? h(
          'div',
          { className: 'login-links' },
          h('button', { className: 'add-button', onClick: () => openRecordForm(null) }, icon('plus', 19), '填報公開觀課'),
          h(
            'button',
            { className: 'empty-add', disabled: !state.records.length, onClick: exportRecords },
            icon('download', 16),
            '下載 Excel'
          )
        )
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
