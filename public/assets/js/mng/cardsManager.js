import { showToast } from '../ui/toast.js';

const API_BASE = '/api/mng/cards';

const elements = {
  body: document.getElementById('cardsBody'),
  addButton: document.getElementById('btnAddCard'),
  deleteSelectedButton: document.getElementById('btnDeleteSelected'),
  exportButton: document.getElementById('btnExportCards'),
  searchInput: document.getElementById('searchInput'),
  searchButton: document.getElementById('btnSearch'),
  gradeFilter: document.getElementById('gradeFilter'),
  classFilter: document.getElementById('classFilter'),
  selectAll: document.getElementById('selectAllCards'),
  modal: document.getElementById('cardModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalClose: document.getElementById('btnCloseModal'),
  modalCancel: document.getElementById('btnCancel'),
  form: document.getElementById('cardForm'),
  submitButton: document.getElementById('btnSubmit'),
  weekDisplayRow: document.getElementById('weekDisplayRow'),
  weekDisplay: document.getElementById('weekDisplay'),
  titleInput: document.getElementById('titleInput'),
  gradeInput: document.getElementById('gradeInput'),
  prereqSelect: document.getElementById('prereqSelect'),
  allClassesToggle: document.getElementById('allClassesToggle'),
  classesOptions: document.getElementById('classesOptions'),
  classesManual: document.getElementById('classesManual'),
  confirmModal: document.getElementById('confirmModal'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmClose: document.getElementById('btnCloseConfirm'),
  confirmCancel: document.getElementById('btnCancelDelete'),
  confirmSubmit: document.getElementById('btnConfirmDelete'),
  completionsModal: document.getElementById('completionsModal'),
  completionsTitle: document.getElementById('completionsTitle'),
  completionsSubtitle: document.getElementById('completionsSubtitle'),
  completionsBody: document.getElementById('completionsBody'),
  completionsClose: document.getElementById('btnCloseCompletions')
};

const state = {
  cards: [],
  mode: 'add',
  activeWeek: null,
  prereqOptions: []
};

const gradeLabels = {
  '1': 'الأول',
  '2': 'الثاني',
  '3': 'الثالث',
  '4': 'الرابع',
  '5': 'الخامس',
  '6': 'السادس',
  '7': 'السابع',
  '8': 'الثامن',
  '9': 'التاسع'
};

const classOptions = Array.from({ length: 10 }, (_, index) => String(index + 1));

let searchTimeout = null;
let confirmAction = null;
let confirmBusy = false;

function setLoading(message) {
  elements.body.innerHTML = `
    <tr>
      <td colspan="7" class="muted center">${message}</td>
    </tr>
  `;
}

function setCompletionsLoading(message) {
  elements.completionsBody.innerHTML = `
    <tr>
      <td colspan="5" class="muted center">${message}</td>
    </tr>
  `;
}

function fetchWithCredentials(url, options) {
  return fetch(url, { credentials: 'include', ...(options || {}) });
}

function normalizeValue(value) {
  return value == null ? '' : String(value).trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeDigits(value) {
  const map = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9',
    '۰': '0',
    '۱': '1',
    '۲': '2',
    '۳': '3',
    '۴': '4',
    '۵': '5',
    '۶': '6',
    '۷': '7',
    '۸': '8',
    '۹': '9'
  };
  return normalizeValue(value)
    .split('')
    .map((char) => map[char] ?? char)
    .join('');
}

function formatGrade(value) {
  const normalized = normalizeDigits(value);
  return gradeLabels[normalized] || normalized || '-';
}

function formatPrereqLabel(card) {
  const prereqSeq = normalizeDigits(card.prereqSeq);
  const prereqTitle = normalizeValue(card.prereqTitle);
  if (!prereqSeq && !prereqTitle) return '—';
  return `${escapeHtml(prereqSeq)} — ${escapeHtml(prereqTitle || 'بدون عنوان')}`;
}

function setClassFilterEnabled(enabled) {
  if (!elements.classFilter) return;
  if (!enabled) {
    elements.classFilter.innerHTML = '<option value="">كل الشعب</option>';
    elements.classFilter.value = '';
    elements.classFilter.disabled = true;
    return;
  }

  const options = ['<option value="">كل الشعب</option>'];
  classOptions.forEach((className) => {
    options.push(`<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`);
  });
  elements.classFilter.innerHTML = options.join('');
  elements.classFilter.disabled = false;
}

function buildClassOptions() {
  if (!elements.classesOptions) return;
  elements.classesOptions.innerHTML = classOptions
    .map(
      (className) => `
        <label class="label">
          <input class="class-check" type="checkbox" value="${escapeHtml(className)}" />
          شعبة ${escapeHtml(className)}
        </label>
      `
    )
    .join('');
}

function setClassesDisabled(disabled) {
  const inputs = elements.classesOptions?.querySelectorAll('.class-check') || [];
  inputs.forEach((input) => {
    input.disabled = disabled;
  });
  if (elements.classesManual) {
    elements.classesManual.disabled = disabled;
  }
}

function getFilters() {
  return {
    grade: normalizeDigits(elements.gradeFilter.value),
    className: normalizeDigits(elements.classFilter.value),
    q: normalizeValue(elements.searchInput.value)
  };
}

async function fetchCards() {
  setLoading('تحميل البيانات...');
  const { grade, className, q } = getFilters();
  const params = new URLSearchParams();
  if (grade) params.set('grade', grade);
  if (className) params.set('class', className);
  if (q) params.set('q', q);

  try {
    const response = await fetchWithCredentials(`${API_BASE}?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data?.error || 'تعذر تحميل البيانات.');
    }

    state.cards = data.cards || [];
    renderCards(state.cards);
    updateExportButtonState(state.cards.length);
    updateBulkDeleteState();
  } catch (error) {
    setLoading('تعذر تحميل البيانات.');
    showToast('خطأ', error.message || 'تعذر تحميل البيانات.', 'error');
  }
}

function renderCards(list) {
  if (!list.length) {
    setLoading('لا توجد نتائج حالياً.');
    return;
  }

  elements.body.innerHTML = list
    .map((card) => {
      const week = normalizeDigits(card.week);
      const seq = normalizeDigits(card.seq);
      const title = normalizeValue(card.title);
      const gradeLabel = formatGrade(card.grade);
      const classes = Array.isArray(card.classes) ? card.classes : [];
      const hasAllClasses = Boolean(card.isAllClasses);
      const classesLabel = hasAllClasses
        ? 'كل الشعب'
        : classes.length
          ? classes.map((entry) => escapeHtml(normalizeDigits(entry))).join(', ')
          : 'غير محدد';
      const prereqLabel = formatPrereqLabel(card);

      return `
        <tr>
          <td class="select-cell">
            <input class="row-check" type="checkbox" data-week="${escapeHtml(week)}" aria-label="تحديد البطاقة" />
          </td>
          <td class="ltr">${escapeHtml(seq || '-')}
            <div class="small muted">ID: ${escapeHtml(week)}</div>
          </td>
          <td>${escapeHtml(title)}</td>
          <td>${escapeHtml(gradeLabel)}</td>
          <td>${classesLabel}</td>
          <td>${prereqLabel}</td>
          <td class="actions">
            <button class="btn btn-outline btn-sm icon-btn" data-action="edit" data-week="${escapeHtml(week)}" title="تعديل" aria-label="تعديل">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M3 17.25V21h3.75l11-11-3.75-3.75-11 11zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
              </svg>
            </button>
            <button class="btn btn-ghost btn-sm icon-btn" data-action="content" data-week="${escapeHtml(week)}" title="تحرير المحتوى" aria-label="تحرير المحتوى">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H7v-2h3v2zm0-4H7v-2h3v2zm0-4H7V7h3v2zm7 8h-5v-2h5v2zm0-4h-5v-2h5v2zm0-4h-5V7h5v2z"/>
              </svg>
            </button>
            <button class="btn btn-ghost btn-sm icon-btn" data-action="completions" data-week="${escapeHtml(week)}" title="من أنهى البطاقة" aria-label="من أنهى البطاقة">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
              </svg>
            </button>
            <button class="btn btn-ghost btn-sm icon-btn" data-action="delete" data-week="${escapeHtml(week)}" title="حذف" aria-label="حذف">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.7 4.29 12 10.59l6.29-6.3z"/>
              </svg>
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function getSelectedWeeks() {
  return Array.from(elements.body.querySelectorAll('.row-check:checked'))
    .map((checkbox) => checkbox.dataset.week)
    .filter(Boolean);
}

function updateBulkDeleteState() {
  const selected = getSelectedWeeks();
  elements.deleteSelectedButton.disabled = selected.length === 0;
  elements.deleteSelectedButton.textContent = selected.length
    ? `حذف المحدد (${selected.length})`
    : 'حذف المحدد';

  if (elements.selectAll) {
    const total = elements.body.querySelectorAll('.row-check').length;
    elements.selectAll.checked = total > 0 && selected.length === total;
    elements.selectAll.indeterminate = selected.length > 0 && selected.length < total;
  }
}

function updateExportButtonState(total) {
  if (!elements.exportButton) return;
  elements.exportButton.disabled = total === 0;
}

function buildExportFileName() {
  const gradePart = normalizeDigits(elements.gradeFilter.value) || 'all';
  const classPart = normalizeDigits(elements.classFilter.value) || 'all';
  const datePart = new Date().toISOString().split('T')[0];
  return `cards_${datePart}_grade-${gradePart}_class-${classPart}.xlsx`;
}

function handleExportCards() {
  if (!state.cards.length) {
    updateExportButtonState(0);
    showToast('تنبيه', 'لا توجد نتائج للتصدير.', 'warning');
    return;
  }

  if (!window.XLSX) {
    showToast('خطأ', 'تعذر تحميل مكتبة تصدير Excel.', 'error');
    return;
  }

  const headers = ['Seq', 'Title', 'Grade', 'Classes', 'Prereq', 'CompletedCount'];
  const rows = state.cards.map((card) => {
    const seq = normalizeDigits(card.seq);
    const title = normalizeValue(card.title);
    const grade = normalizeDigits(card.grade);
    const classes = Array.isArray(card.classes) ? card.classes : [];
    const classesText = classes.map((entry) => normalizeDigits(entry)).join(', ');
    const prereqSeq = normalizeDigits(card.prereqSeq);
    const prereqTitle = normalizeValue(card.prereqTitle);
    const prereqText = prereqSeq || prereqTitle ? `${prereqSeq} - ${prereqTitle}` : '';
    const completedCount = Number(card.completedCount || 0);

    return [seq, title, grade, classesText, prereqText, completedCount];
  });

  const worksheet = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Cards');
  window.XLSX.writeFile(workbook, buildExportFileName());
}

function buildPrereqOptions(cards, currentWeek) {
  const options = ['<option value="">لا يوجد</option>'];
  cards
    .filter((card) => normalizeDigits(card.week) !== normalizeDigits(currentWeek))
    .forEach((card) => {
      const seq = normalizeDigits(card.seq);
      const title = normalizeValue(card.title);
      const week = normalizeDigits(card.week);
      options.push(`<option value="${escapeHtml(week)}">${escapeHtml(seq || '-') } - ${escapeHtml(title || 'بدون عنوان')}</option>`);
    });
  return options.join('');
}

async function updatePrereqOptions(grade, currentWeek, selectedWeek) {
  if (!elements.prereqSelect) return;
  if (!grade) {
    elements.prereqSelect.innerHTML = '<option value="">لا يوجد</option>';
    elements.prereqSelect.disabled = true;
    return;
  }

  elements.prereqSelect.disabled = true;
  elements.prereqSelect.innerHTML = '<option value="">جاري التحميل...</option>';

  try {
    const params = new URLSearchParams();
    params.set('grade', grade);
    params.set('class', 'ALL_CLASSES');

    const response = await fetchWithCredentials(`${API_BASE}?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data?.error || 'تعذر تحميل المتطلبات السابقة.');
    }

    const cards = Array.isArray(data.cards) ? data.cards : [];
    cards.sort((a, b) => Number(a.seq) - Number(b.seq));
    state.prereqOptions = cards;
    elements.prereqSelect.innerHTML = buildPrereqOptions(cards, currentWeek);
    elements.prereqSelect.value = normalizeDigits(selectedWeek || '');
    elements.prereqSelect.disabled = false;
  } catch (error) {
    elements.prereqSelect.innerHTML = '<option value="">لا يوجد</option>';
    elements.prereqSelect.disabled = false;
    showToast('خطأ', error.message || 'تعذر تحميل المتطلبات السابقة.', 'error');
  }
}

function openModal(mode, card = {}) {
  state.mode = mode;
  state.activeWeek = normalizeDigits(card.week);
  const isEdit = mode === 'edit';

  elements.modalTitle.textContent = isEdit ? 'تعديل بيانات البطاقة' : 'إضافة بطاقة';
  elements.submitButton.textContent = isEdit ? 'حفظ التعديلات' : 'إضافة البطاقة';

  elements.modal.classList.remove('hidden');
  elements.modal.setAttribute('aria-hidden', 'false');

  elements.weekDisplayRow.style.display = isEdit ? 'block' : 'none';
  if (elements.weekDisplay) {
    elements.weekDisplay.textContent = isEdit ? `ID: ${normalizeDigits(card.week)}` : 'سيتم توليد المعرّف تلقائياً';
  }

  elements.titleInput.value = normalizeValue(card.title);
  elements.gradeInput.value = normalizeDigits(card.grade);
  elements.classesManual.value = '';

  const hasAllClasses = Boolean(card.isAllClasses);
  elements.allClassesToggle.checked = hasAllClasses || !Array.isArray(card.classes) || !card.classes.length;

  const checkedClasses = new Set(
    (card.classes || []).map((entry) => normalizeDigits(entry)).filter(Boolean)
  );
  const checkboxes = elements.classesOptions.querySelectorAll('.class-check');
  checkboxes.forEach((checkbox) => {
    checkbox.checked = checkedClasses.has(checkbox.value);
  });

  setClassesDisabled(elements.allClassesToggle.checked);
  updatePrereqOptions(elements.gradeInput.value, card.week, card.prereqWeek);
}

function closeModal() {
  elements.modal.classList.add('hidden');
  elements.modal.setAttribute('aria-hidden', 'true');
  elements.form.reset();
  setClassesDisabled(elements.allClassesToggle.checked);
}

function openConfirmModal({ title, message, onConfirm }) {
  confirmAction = onConfirm;
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmModal.classList.remove('hidden');
  elements.confirmModal.setAttribute('aria-hidden', 'false');
}

function closeConfirmModal(force = false) {
  if (confirmBusy && !force) return;
  confirmAction = null;
  elements.confirmModal.classList.add('hidden');
  elements.confirmModal.setAttribute('aria-hidden', 'true');
}

function openCompletionsModal(card) {
  elements.completionsTitle.textContent = `من أنهى البطاقة ${normalizeDigits(card.seq)}`;
  elements.completionsSubtitle.textContent = 'جاري التحميل...';
  setCompletionsLoading('تحميل البيانات...');
  elements.completionsModal.classList.remove('hidden');
  elements.completionsModal.setAttribute('aria-hidden', 'false');

  fetchCompletions(card);
}

function closeCompletionsModal() {
  elements.completionsModal.classList.add('hidden');
  elements.completionsModal.setAttribute('aria-hidden', 'true');
}

async function fetchCompletions(card) {
  const className = normalizeDigits(elements.classFilter.value) || 'ALL_CLASSES';
  const params = new URLSearchParams();
  if (className) params.set('class', className);

  try {
    const response = await fetchWithCredentials(`${API_BASE}/${encodeURIComponent(card.week)}/completions?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data?.error || 'تعذر تحميل البيانات.');
    }

    const students = Array.isArray(data.students) ? data.students : [];
    elements.completionsSubtitle.textContent = `الإجمالي: ${students.length}`;

    if (!students.length) {
      setCompletionsLoading('لا يوجد طلاب أكملوا البطاقة بعد.');
      return;
    }

    elements.completionsBody.innerHTML = students
      .map((student) => `
        <tr>
          <td class="ltr">${escapeHtml(student.StudentId)}</td>
          <td>${escapeHtml(student.FullName || '—')}</td>
          <td>${escapeHtml(student.Class || '—')}</td>
          <td>${escapeHtml(student.FinalScore ?? '-') }</td>
          <td>${escapeHtml(new Date(student.CompletedAt).toLocaleString('ar'))}</td>
        </tr>
      `)
      .join('');
  } catch (error) {
    elements.completionsSubtitle.textContent = 'تعذر تحميل البيانات.';
    setCompletionsLoading('تعذر تحميل البيانات.');
    showToast('خطأ', error.message || 'تعذر تحميل البيانات.', 'error');
  }
}

async function handleConfirmSubmit() {
  if (!confirmAction || confirmBusy) return;
  confirmBusy = true;
  elements.confirmSubmit.disabled = true;

  try {
    await confirmAction();
    closeConfirmModal(true);
  } catch (error) {
    showToast('خطأ', error.message || 'حدث خطأ أثناء الحذف.', 'error');
  } finally {
    confirmBusy = false;
    elements.confirmSubmit.disabled = false;
  }
}

function collectClasses() {
  if (elements.allClassesToggle.checked) return [];

  const selected = Array.from(elements.classesOptions.querySelectorAll('.class-check:checked'))
    .map((input) => normalizeDigits(input.value))
    .filter(Boolean);

  const manualValues = normalizeValue(elements.classesManual.value)
    .split(',')
    .map((entry) => normalizeDigits(entry))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return Array.from(new Set([...selected, ...manualValues]));
}

async function handleSubmit(event) {
  event.preventDefault();

  const title = normalizeValue(elements.titleInput.value);
  const grade = normalizeDigits(elements.gradeInput.value);
  const allClasses = Boolean(elements.allClassesToggle.checked);
  const classes = collectClasses();
  const prereqWeekRaw = normalizeDigits(elements.prereqSelect.value);
  const prereqWeek = prereqWeekRaw ? Number(prereqWeekRaw) : null;

  if (!title) {
    showToast('تنبيه', 'العنوان مطلوب.', 'warning');
    return;
  }

  if (!grade) {
    showToast('تنبيه', 'اختر الصف.', 'warning');
    return;
  }

  const payload = {
    title,
    grade,
    classes,
    allClasses,
    prereqWeek
  };

  const isEdit = state.mode === 'edit';
  const url = isEdit ? `${API_BASE}/${encodeURIComponent(state.activeWeek)}` : API_BASE;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const response = await fetchWithCredentials(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data?.error || 'تعذر حفظ البطاقة.');
    }

    closeModal();
    showToast('نجاح', isEdit ? 'تم تحديث البطاقة.' : 'تمت إضافة البطاقة.', 'success');
    await fetchCards();
  } catch (error) {
    showToast('خطأ', error.message || 'تعذر حفظ البطاقة.', 'error');
  }
}

function handleEdit(week) {
  const card = state.cards.find((item) => normalizeDigits(item.week) === normalizeDigits(week));
  if (!card) return;
  openModal('edit', card);
}

function handleDelete(week) {
  openConfirmModal({
    title: 'تأكيد الحذف',
    message: 'هل أنت متأكد من حذف البطاقة؟',
    onConfirm: async () => {
      const response = await fetchWithCredentials(`${API_BASE}/${encodeURIComponent(week)}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || 'تعذر حذف البطاقة.');
      }
      showToast('نجاح', 'تم حذف البطاقة.', 'success');
      await fetchCards();
    }
  });
}

function handleBulkDelete() {
  const selected = getSelectedWeeks();
  if (!selected.length) return;

  openConfirmModal({
    title: 'تأكيد الحذف',
    message: `هل أنت متأكد من حذف البطاقات المحددة؟ (${selected.length})`,
    onConfirm: async () => {
      const results = await Promise.all(
        selected.map((week) =>
          fetchWithCredentials(`${API_BASE}/${encodeURIComponent(week)}`, { method: 'DELETE' })
            .then((response) => response.json().then((data) => ({ response, data })))
        )
      );

      const failed = results.filter(({ response, data }) => !response.ok || !data.ok);
      if (failed.length) {
        throw new Error('تعذر حذف بعض البطاقات.');
      }

      showToast('نجاح', 'تم حذف البطاقات المحددة.', 'success');
      await fetchCards();
    }
  });
}

function handleTableClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const week = button.dataset.week;
  if (!week) return;
  if (action === 'edit') {
    handleEdit(week);
  }
  if (action === 'delete') {
    handleDelete(week);
  }
  if (action === 'content') {
    window.open(`/mng/card-editor.html?week=${encodeURIComponent(week)}`, '_blank');
  }
  if (action === 'completions') {
    const card = state.cards.find((item) => normalizeDigits(item.week) === normalizeDigits(week));
    if (card) openCompletionsModal(card);
  }
}

function handleTableChange(event) {
  if (event.target?.classList.contains('row-check')) {
    updateBulkDeleteState();
  }
}

function handleSelectAllChange() {
  const shouldSelect = elements.selectAll.checked;
  elements.body.querySelectorAll('.row-check').forEach((checkbox) => {
    checkbox.checked = shouldSelect;
  });
  updateBulkDeleteState();
}

function handleSearch() {
  fetchCards();
}

function handleSearchInput() {
  if (searchTimeout) window.clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(() => {
    handleSearch();
  }, 350);
}

function handleGradeFilterChange() {
  const grade = normalizeDigits(elements.gradeFilter.value);
  setClassFilterEnabled(Boolean(grade));
  fetchCards();
}

function handleClassFilterChange() {
  fetchCards();
}

function handleAllClassesToggle() {
  setClassesDisabled(elements.allClassesToggle.checked);
}

function handleBackdropClick(event) {
  if (event.target.dataset?.close) {
    closeModal();
  }
}

function handleConfirmBackdropClick(event) {
  if (event.target.dataset?.close) {
    closeConfirmModal();
  }
}

function handleCompletionsBackdropClick(event) {
  if (event.target.dataset?.close) {
    closeCompletionsModal();
  }
}

function bindEvents() {
  elements.addButton.addEventListener('click', () => openModal('add'));
  elements.modalClose.addEventListener('click', closeModal);
  elements.modalCancel.addEventListener('click', closeModal);
  elements.modal.addEventListener('click', handleBackdropClick);
  elements.form.addEventListener('submit', handleSubmit);
  elements.body.addEventListener('click', handleTableClick);
  elements.body.addEventListener('change', handleTableChange);
  elements.selectAll.addEventListener('change', handleSelectAllChange);
  elements.deleteSelectedButton.addEventListener('click', handleBulkDelete);
  elements.exportButton.addEventListener('click', handleExportCards);
  elements.searchButton.addEventListener('click', handleSearch);
  elements.searchInput.addEventListener('input', handleSearchInput);
  elements.gradeFilter.addEventListener('change', handleGradeFilterChange);
  elements.classFilter.addEventListener('change', handleClassFilterChange);
  elements.gradeInput.addEventListener('change', () => {
    updatePrereqOptions(normalizeDigits(elements.gradeInput.value), state.activeWeek, null);
  });
  elements.allClassesToggle.addEventListener('change', handleAllClassesToggle);
  elements.confirmClose.addEventListener('click', closeConfirmModal);
  elements.confirmCancel.addEventListener('click', closeConfirmModal);
  elements.confirmModal.addEventListener('click', handleConfirmBackdropClick);
  elements.confirmSubmit.addEventListener('click', handleConfirmSubmit);
  elements.completionsClose.addEventListener('click', closeCompletionsModal);
  elements.completionsModal.addEventListener('click', handleCompletionsBackdropClick);
}

function init() {
  buildClassOptions();
  setClassFilterEnabled(false);
  bindEvents();
  fetchCards();
}

init();
