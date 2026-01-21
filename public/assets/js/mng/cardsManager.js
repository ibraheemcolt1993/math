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
  weekInput: document.getElementById('weekInput'),
  titleInput: document.getElementById('titleInput'),
  gradeInput: document.getElementById('gradeInput'),
  allClassesToggle: document.getElementById('allClassesToggle'),
  classesOptions: document.getElementById('classesOptions'),
  classesManual: document.getElementById('classesManual'),
  confirmModal: document.getElementById('confirmModal'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmClose: document.getElementById('btnCloseConfirm'),
  confirmCancel: document.getElementById('btnCancelDelete'),
  confirmSubmit: document.getElementById('btnConfirmDelete')
};

const state = {
  cards: [],
  mode: 'add',
  activeWeek: null
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
      <td colspan="6" class="muted center">${message}</td>
    </tr>
  `;
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
    const response = await fetch(`${API_BASE}?${params.toString()}`);
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
      const title = normalizeValue(card.title);
      const gradeLabel = formatGrade(card.grade);
      const classes = Array.isArray(card.classes) ? card.classes : [];
      const hasAllClasses = Boolean(card.isAllClasses);
      const classesLabel = hasAllClasses
        ? 'كل الشعب'
        : classes.length
          ? classes.map((entry) => escapeHtml(normalizeDigits(entry))).join(', ')
          : 'غير محدد';

      return `
        <tr>
          <td class="select-cell">
            <input class="row-check" type="checkbox" data-week="${escapeHtml(week)}" aria-label="تحديد البطاقة" />
          </td>
          <td class="ltr">${escapeHtml(week)}</td>
          <td>${escapeHtml(title)}</td>
          <td>${escapeHtml(gradeLabel)}</td>
          <td>${classesLabel}</td>
          <td class="actions">
            <button class="btn btn-outline btn-sm icon-btn" data-action="edit" data-week="${escapeHtml(week)}" title="تعديل" aria-label="تعديل">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M3 17.25V21h3.75l11-11-3.75-3.75-11 11zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
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

  const headers = ['Week', 'Title', 'Grade', 'Classes', 'IsAllClasses'];
  const rows = state.cards.map((card) => {
    const week = normalizeDigits(card.week);
    const title = normalizeValue(card.title);
    const grade = normalizeDigits(card.grade);
    const classes = Array.isArray(card.classes) ? card.classes : [];
    const classesText = classes.map((entry) => normalizeDigits(entry)).join(', ');
    const isAllClasses = card.isAllClasses ? 'true' : 'false';

    return [week, title, grade, classesText, isAllClasses];
  });

  const worksheet = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Cards');
  window.XLSX.writeFile(workbook, buildExportFileName());
}

function openModal(mode, card = {}) {
  state.mode = mode;
  state.activeWeek = normalizeDigits(card.week);
  const isEdit = mode === 'edit';

  elements.modalTitle.textContent = isEdit ? 'تعديل بيانات البطاقة' : 'إضافة بطاقة';
  elements.submitButton.textContent = isEdit ? 'حفظ التعديلات' : 'إضافة البطاقة';

  elements.modal.classList.remove('hidden');
  elements.modal.setAttribute('aria-hidden', 'false');

  elements.weekInput.value = normalizeDigits(card.week);
  elements.weekInput.disabled = isEdit;
  elements.titleInput.value = normalizeValue(card.title);
  elements.gradeInput.value = normalizeDigits(card.grade);

  const hasAllClasses = Boolean(card.isAllClasses);
  elements.allClassesToggle.checked = hasAllClasses || !Array.isArray(card.classes) || !card.classes.length;
  elements.classesManual.value = '';

  const checkedClasses = new Set(
    (card.classes || []).map((entry) => normalizeDigits(entry)).filter(Boolean)
  );
  const checkboxes = elements.classesOptions.querySelectorAll('.class-check');
  checkboxes.forEach((checkbox) => {
    checkbox.checked = checkedClasses.has(checkbox.value);
  });

  setClassesDisabled(elements.allClassesToggle.checked);
}

function closeModal() {
  elements.modal.classList.add('hidden');
  elements.modal.setAttribute('aria-hidden', 'true');
  elements.form.reset();
  elements.weekInput.disabled = false;
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

  const weekValue = normalizeDigits(elements.weekInput.value);
  const title = normalizeValue(elements.titleInput.value);
  const grade = normalizeDigits(elements.gradeInput.value);
  const allClasses = Boolean(elements.allClassesToggle.checked);
  const classes = collectClasses();

  if (!weekValue) {
    showToast('تنبيه', 'رقم البطاقة مطلوب.', 'warning');
    return;
  }

  if (!title) {
    showToast('تنبيه', 'العنوان مطلوب.', 'warning');
    return;
  }

  if (!grade) {
    showToast('تنبيه', 'اختر الصف.', 'warning');
    return;
  }

  const payload = {
    week: weekValue,
    title,
    grade,
    classes,
    allClasses
  };

  const isEdit = state.mode === 'edit';
  const url = isEdit ? `${API_BASE}/${encodeURIComponent(state.activeWeek)}` : API_BASE;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
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
      const response = await fetch(`${API_BASE}/${encodeURIComponent(week)}`, {
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
          fetch(`${API_BASE}/${encodeURIComponent(week)}`, { method: 'DELETE' })
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
  elements.allClassesToggle.addEventListener('change', handleAllClassesToggle);
  elements.confirmClose.addEventListener('click', closeConfirmModal);
  elements.confirmCancel.addEventListener('click', closeConfirmModal);
  elements.confirmModal.addEventListener('click', handleConfirmBackdropClick);
  elements.confirmSubmit.addEventListener('click', handleConfirmSubmit);
}

function init() {
  buildClassOptions();
  setClassFilterEnabled(false);
  bindEvents();
  fetchCards();
}

init();
