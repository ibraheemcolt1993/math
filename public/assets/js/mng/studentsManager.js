import { showToast } from '../ui/toast.js';

const API_BASE = '/api/mng/students';

const elements = {
  body: document.getElementById('studentsBody'),
  addButton: document.getElementById('btnAddStudent'),
  deleteSelectedButton: document.getElementById('btnDeleteSelected'),
  searchInput: document.getElementById('searchInput'),
  searchButton: document.getElementById('btnSearch'),
  gradeFilter: document.getElementById('gradeFilter'),
  classFilter: document.getElementById('classFilter'),
  clearFiltersButton: document.getElementById('btnClearFilters'),
  pagination: document.getElementById('studentsPagination'),
  selectAll: document.getElementById('selectAllStudents'),
  modal: document.getElementById('studentModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalClose: document.getElementById('btnCloseModal'),
  modalCancel: document.getElementById('btnCancel'),
  form: document.getElementById('studentForm'),
  submitButton: document.getElementById('btnSubmit'),
  studentIdInput: document.getElementById('studentIdInput'),
  wheelYear: document.getElementById('wheelYear'),
  wheelMonth: document.getElementById('wheelMonth'),
  wheelDay: document.getElementById('wheelDay'),
  nameInput: document.getElementById('nameInput'),
  firstNameInput: document.getElementById('firstNameInput'),
  wheelGrade: document.getElementById('wheelGrade'),
  classInput: document.getElementById('classInput'),
  confirmModal: document.getElementById('confirmModal'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmClose: document.getElementById('btnCloseConfirm'),
  confirmCancel: document.getElementById('btnCancelDelete'),
  confirmSubmit: document.getElementById('btnConfirmDelete')
};

const state = {
  students: [],
  mode: 'add',
  currentPage: 1,
  pageSize: 10
};

let searchTimeout = null;
let firstNameTouched = false;
let confirmAction = null;
let confirmBusy = false;

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

function setLoading(message) {
  elements.body.innerHTML = `
    <tr>
      <td colspan="7" class="muted center">${message}</td>
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

function toNumber(value) {
  return Number.parseInt(value, 10);
}

function deriveFirstNameFromName(name) {
  const parts = normalizeValue(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts[0] === 'عبد' && parts[1]) {
    return `عبد ${parts[1]}`;
  }
  return parts[0];
}

function padTwo(value) {
  return String(value).padStart(2, '0');
}

function buildWheelItems(wheel, items) {
  wheel.innerHTML = '';
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'wheel-item';
    div.textContent = item.label;
    div.dataset.value = item.value;
    fragment.appendChild(div);
  });
  wheel.appendChild(fragment);
}

function getWheelItems(wheel) {
  return Array.from(wheel.querySelectorAll('.wheel-item'));
}

function getWheelSelectedItem(wheel) {
  const items = getWheelItems(wheel);
  if (!items.length) return null;
  const wheelRect = wheel.getBoundingClientRect();
  const center = wheelRect.top + wheelRect.height / 2;
  let closest = items[0];
  let closestDistance = Infinity;
  items.forEach((item) => {
    const rect = item.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - center);
    if (distance < closestDistance) {
      closest = item;
      closestDistance = distance;
    }
  });
  return closest;
}

function setWheelSelectedItem(wheel, targetItem, smooth = true) {
  if (!targetItem) return;
  getWheelItems(wheel).forEach((item) => item.classList.remove('is-selected'));
  targetItem.classList.add('is-selected');
  const wheelRect = wheel.getBoundingClientRect();
  const itemRect = targetItem.getBoundingClientRect();
  const offset = itemRect.top - wheelRect.top + wheel.scrollTop;
  const targetScroll = offset - (wheelRect.height / 2 - itemRect.height / 2);
  wheel.scrollTo({ top: targetScroll, behavior: smooth ? 'smooth' : 'auto' });
}

function selectWheelValue(wheel, value, smooth = false) {
  const items = getWheelItems(wheel);
  if (!items.length) return;
  const match = items.find((item) => item.dataset.value === String(value));
  setWheelSelectedItem(wheel, match || items[0], smooth);
}

function getWheelValue(wheel) {
  const selected = getWheelSelectedItem(wheel);
  return selected?.dataset.value ?? '';
}

function attachWheelHandler(wheel, onChange) {
  let timeout = null;
  wheel.addEventListener('scroll', () => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      const selected = getWheelSelectedItem(wheel);
      setWheelSelectedItem(wheel, selected, true);
      if (onChange) onChange(selected?.dataset.value ?? '');
    }, 120);
  });
}

function buildBirthYearWheel() {
  const currentYear = new Date().getFullYear();
  const startYear = 1980;
  const years = [];
  for (let year = currentYear; year >= startYear; year -= 1) {
    years.push({ value: year, label: year });
  }
  buildWheelItems(elements.wheelYear, years);
}

function buildBirthMonthWheel() {
  const months = [
    { value: 1, label: 'يناير' },
    { value: 2, label: 'فبراير' },
    { value: 3, label: 'مارس' },
    { value: 4, label: 'أبريل' },
    { value: 5, label: 'مايو' },
    { value: 6, label: 'يونيو' },
    { value: 7, label: 'يوليو' },
    { value: 8, label: 'أغسطس' },
    { value: 9, label: 'سبتمبر' },
    { value: 10, label: 'أكتوبر' },
    { value: 11, label: 'نوفمبر' },
    { value: 12, label: 'ديسمبر' }
  ];
  buildWheelItems(elements.wheelMonth, months);
}

function buildBirthDayWheel(year, month, selectedDay) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return { value: day, label: padTwo(day) };
  });
  buildWheelItems(elements.wheelDay, days);
  const targetDay = Math.min(selectedDay || 1, daysInMonth);
  selectWheelValue(elements.wheelDay, targetDay);
}

function buildGradeWheel() {
  const items = [
    { value: '', label: 'غير محدد' },
    ...Object.entries(gradeLabels).map(([value, label]) => ({ value, label }))
  ];
  buildWheelItems(elements.wheelGrade, items);
}

function parseDateParts(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return {
    year: match[1],
    month: String(parseInt(match[2], 10)),
    day: String(parseInt(match[3], 10))
  };
}

function initializeWheels() {
  buildBirthYearWheel();
  buildBirthMonthWheel();
  buildGradeWheel();

  const currentYear = new Date().getFullYear();
  selectWheelValue(elements.wheelYear, currentYear);
  selectWheelValue(elements.wheelMonth, 1);
  buildBirthDayWheel(currentYear, 1, 1);
  selectWheelValue(elements.wheelGrade, '');

  attachWheelHandler(elements.wheelYear, (value) => {
    const year = toNumber(value) || currentYear;
    const month = toNumber(getWheelValue(elements.wheelMonth)) || 1;
    const day = toNumber(getWheelValue(elements.wheelDay)) || 1;
    buildBirthDayWheel(year, month, day);
  });
  attachWheelHandler(elements.wheelMonth, (value) => {
    const year = toNumber(getWheelValue(elements.wheelYear)) || currentYear;
    const month = toNumber(value) || 1;
    const day = toNumber(getWheelValue(elements.wheelDay)) || 1;
    buildBirthDayWheel(year, month, day);
  });
  attachWheelHandler(elements.wheelDay);
  attachWheelHandler(elements.wheelGrade);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.message || 'تعذر تنفيذ الطلب.';
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function loadStudents() {
  setLoading('جاري تحميل البيانات...');
  try {
    const data = await fetchJson(API_BASE);
    const list = Array.isArray(data) ? data : data.students || [];
    state.students = list;
    updateClassFilterOptions(elements.gradeFilter.value);
    applyFilters({ resetPage: true });
  } catch (error) {
    setLoading('تعذر تحميل البيانات.');
    showToast('خطأ', error.message, 'error');
  }
}

function renderStudents(list) {
  if (!list.length) {
    setLoading('لا توجد نتائج حالياً.');
    return;
  }

  elements.body.innerHTML = list
    .map((student) => {
      const studentId = normalizeValue(student.StudentId || student.studentId);
      const birthYear = normalizeValue(student.BirthYear || student.birthYear);
      const name = normalizeValue(student.Name || student.name);
      const grade = normalizeValue(student.Grade || student.grade);
      const className = normalizeValue(student.Class || student.class);
      const gradeLabel = gradeLabels[grade] || grade;

      return `
        <tr>
          <td class="select-cell">
            <input class="row-check" type="checkbox" data-id="${escapeHtml(studentId)}" aria-label="تحديد الطالب" />
          </td>
          <td class="ltr">${escapeHtml(studentId)}</td>
          <td class="ltr">${escapeHtml(birthYear)}</td>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(gradeLabel)}</td>
          <td>${escapeHtml(className)}</td>
          <td class="actions">
            <button class="btn btn-outline btn-sm icon-btn" data-action="edit" data-id="${escapeHtml(studentId)}" title="تعديل" aria-label="تعديل">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M3 17.25V21h3.75l11-11-3.75-3.75-11 11zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
              </svg>
            </button>
            <button class="btn btn-ghost btn-sm icon-btn" data-action="delete" data-id="${escapeHtml(studentId)}" title="حذف" aria-label="حذف">
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

function openModal(mode, student = {}) {
  state.mode = mode;
  const isEdit = mode === 'edit';
  firstNameTouched = false;

  elements.modalTitle.textContent = isEdit ? 'تعديل بيانات الطالب' : 'إضافة طالب';
  elements.submitButton.textContent = isEdit ? 'حفظ التعديلات' : 'إضافة الطالب';

  elements.modal.classList.remove('hidden');
  elements.modal.setAttribute('aria-hidden', 'false');

  elements.studentIdInput.value = normalizeValue(student.StudentId || student.studentId);
  elements.nameInput.value = normalizeValue(student.Name || student.name);
  elements.firstNameInput.value = normalizeValue(student.FirstName || student.firstName);
  elements.classInput.value = normalizeValue(student.Class || student.class);

  const birthDateParts = parseDateParts(student.BirthDate || student.birthDate);
  const fallbackBirthYear = normalizeValue(student.BirthYear || student.birthYear);
  const yearValue = birthDateParts?.year || fallbackBirthYear || String(new Date().getFullYear());
  const monthValue = birthDateParts?.month || '1';
  const dayValue = birthDateParts?.day || '1';
  selectWheelValue(elements.wheelYear, yearValue);
  selectWheelValue(elements.wheelMonth, monthValue);
  buildBirthDayWheel(toNumber(yearValue), toNumber(monthValue), toNumber(dayValue));

  const gradeValue = normalizeValue(student.Grade || student.grade);
  selectWheelValue(elements.wheelGrade, gradeValue);

  elements.studentIdInput.disabled = isEdit;
}

function closeModal() {
  elements.form.reset();
  const currentYear = new Date().getFullYear();
  selectWheelValue(elements.wheelYear, currentYear);
  selectWheelValue(elements.wheelMonth, 1);
  buildBirthDayWheel(currentYear, 1, 1);
  selectWheelValue(elements.wheelGrade, '');
  elements.studentIdInput.disabled = false;
  firstNameTouched = false;
  elements.modal.classList.add('hidden');
  elements.modal.setAttribute('aria-hidden', 'true');
}

function findStudentById(studentId) {
  return state.students.find((student) =>
    normalizeValue(student.StudentId || student.studentId) === studentId
  );
}

async function handleSubmit(event) {
  event.preventDefault();

  const payload = {
    studentId: normalizeValue(elements.studentIdInput.value),
    birthYear: normalizeValue(getWheelValue(elements.wheelYear)),
    birthMonth: normalizeValue(getWheelValue(elements.wheelMonth)),
    birthDay: normalizeValue(getWheelValue(elements.wheelDay)),
    name: normalizeValue(elements.nameInput.value),
    firstName: normalizeValue(elements.firstNameInput.value),
    grade: normalizeValue(getWheelValue(elements.wheelGrade)),
    class: normalizeValue(elements.classInput.value)
  };

  if (!payload.studentId || !payload.birthYear || !payload.name) {
    showToast('تنبيه', 'يرجى تعبئة الحقول المطلوبة.', 'warning');
    return;
  }

  if (!payload.birthMonth || !payload.birthDay) {
    showToast('تنبيه', 'يرجى اختيار تاريخ الميلاد بالكامل.', 'warning');
    return;
  }

  const birthDate = `${payload.birthYear}-${padTwo(payload.birthMonth)}-${padTwo(payload.birthDay)}`;

  try {
    if (state.mode === 'add') {
      await fetchJson(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: payload.studentId,
          birthYear: payload.birthYear,
          name: payload.name,
          firstName: payload.firstName,
          birthDate,
          grade: payload.grade,
          class: payload.class
        })
      });
      showToast('تمت الإضافة', 'تم إضافة الطالب بنجاح.', 'success');
    } else {
      await fetchJson(`${API_BASE}/${encodeURIComponent(payload.studentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthYear: payload.birthYear,
          name: payload.name,
          firstName: payload.firstName,
          birthDate,
          grade: payload.grade,
          class: payload.class
        })
      });
      showToast('تم التعديل', 'تم تحديث بيانات الطالب.', 'success');
    }

    closeModal();
    loadStudents();
  } catch (error) {
    showToast('خطأ', error.message, 'error');
  }
}

function handleNameBlur() {
  const nameValue = normalizeValue(elements.nameInput.value);
  const firstNameValue = normalizeValue(elements.firstNameInput.value);
  if (!nameValue) return;
  if (!firstNameValue || !firstNameTouched) {
    elements.firstNameInput.value = deriveFirstNameFromName(nameValue);
    firstNameTouched = false;
  }
}

function handleFirstNameInput() {
  firstNameTouched = true;
}

function getSelectedStudentIds() {
  return Array.from(elements.body.querySelectorAll('.row-check:checked'))
    .map((checkbox) => checkbox.dataset.id)
    .filter(Boolean);
}

function updateBulkDeleteState() {
  const selected = getSelectedStudentIds();
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
    confirmBusy = false;
    closeConfirmModal(true);
  } catch (error) {
    showToast('خطأ', error.message, 'error');
  } finally {
    confirmBusy = false;
    elements.confirmSubmit.disabled = false;
  }
}

async function handleDelete(studentId) {
  openConfirmModal({
    title: 'تأكيد الحذف',
    message: 'هل أنت متأكد من حذف الطالب؟',
    onConfirm: async () => {
      await fetchJson(`${API_BASE}/${encodeURIComponent(studentId)}`, {
        method: 'DELETE'
      });
      showToast('تم الحذف', 'تم حذف الطالب بنجاح.', 'success');
      loadStudents();
    }
  });
}

function handleDeleteSelected() {
  const selected = getSelectedStudentIds();
  if (!selected.length) return;
  openConfirmModal({
    title: 'تأكيد الحذف الجماعي',
    message: `سيتم حذف ${selected.length} طالب/طلاب. هل تريد المتابعة؟`,
    onConfirm: async () => {
      const deletions = await Promise.allSettled(
        selected.map((id) =>
          fetchJson(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
        )
      );
      const failed = deletions.filter((result) => result.status === 'rejected');
      if (failed.length) {
        throw new Error('حدثت أخطاء أثناء الحذف الجماعي.');
      }
      showToast('تم الحذف', 'تم حذف الطلاب المحددين بنجاح.', 'success');
      loadStudents();
    }
  });
}

function handleTableClick(event) {
  const actionButton = event.target?.closest('[data-action]');
  const action = actionButton?.dataset?.action;
  const studentId = actionButton?.dataset?.id;
  if (!action || !studentId) return;

  if (action === 'edit') {
    const student = findStudentById(studentId);
    if (!student) {
      showToast('تنبيه', 'تعذر العثور على بيانات الطالب.', 'warning');
      return;
    }
    openModal('edit', student);
    return;
  }

  if (action === 'delete') {
    handleDelete(studentId);
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
  applyFilters({ resetPage: true });
}

function handleSearchInput() {
  if (searchTimeout) window.clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(() => {
    handleSearch();
  }, 350);
}

function updateClassFilterOptions(gradeValue) {
  if (!elements.classFilter) return;
  const grade = normalizeValue(gradeValue);
  if (!grade) {
    elements.classFilter.innerHTML = '<option value="">كل الشعب</option>';
    elements.classFilter.value = '';
    elements.classFilter.disabled = true;
    return;
  }

  const classes = new Set();
  state.students.forEach((student) => {
    const studentGrade = normalizeValue(student.Grade || student.grade);
    if (studentGrade !== grade) return;
    const className = normalizeValue(student.Class || student.class);
    if (className) classes.add(className);
  });

  const options = ['<option value="">كل الشعب</option>'];
  Array.from(classes)
    .sort((a, b) => a.localeCompare(b, 'ar'))
    .forEach((className) => {
      options.push(`<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`);
    });

  const currentValue = elements.classFilter.value;
  elements.classFilter.innerHTML = options.join('');
  elements.classFilter.disabled = false;
  elements.classFilter.value = classes.has(currentValue) ? currentValue : '';
}

function getFilteredStudents() {
  const query = normalizeValue(elements.searchInput.value).toLowerCase();
  const gradeFilter = normalizeValue(elements.gradeFilter.value);
  const classFilter = normalizeValue(elements.classFilter.value);

  return state.students.filter((student) => {
    const studentId = normalizeValue(student.StudentId || student.studentId);
    const name = normalizeValue(student.Name || student.name);
    const grade = normalizeValue(student.Grade || student.grade);
    const className = normalizeValue(student.Class || student.class);

    if (query) {
      const matchesId = studentId.toLowerCase().includes(query);
      const matchesName = name.toLowerCase().includes(query);
      if (!matchesId && !matchesName) return false;
    }

    if (gradeFilter && grade !== gradeFilter) return false;
    if (classFilter && className !== classFilter) return false;

    return true;
  });
}

function updatePagination(totalPages) {
  if (!elements.pagination) return;
  if (!totalPages || totalPages <= 1) {
    elements.pagination.innerHTML = '';
    return;
  }

  const pageButtons = Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    const isActive = page === state.currentPage;
    return `
      <button class="btn btn-outline btn-sm${isActive ? ' is-active' : ''}" data-page="${page}">
        ${page}
      </button>
    `;
  }).join('');

  elements.pagination.innerHTML = `
    <button class="btn btn-outline btn-sm" data-page="prev" ${state.currentPage === 1 ? 'disabled' : ''}>
      السابق
    </button>
    <div class="pagination-pages">${pageButtons}</div>
    <button class="btn btn-outline btn-sm" data-page="next" ${state.currentPage === totalPages ? 'disabled' : ''}>
      التالي
    </button>
  `;
}

function applyFilters({ resetPage = false } = {}) {
  if (resetPage) {
    state.currentPage = 1;
  }

  const filtered = getFilteredStudents();
  const totalPages = filtered.length ? Math.ceil(filtered.length / state.pageSize) : 0;
  if (totalPages && state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }
  const start = (state.currentPage - 1) * state.pageSize;
  const paginated = filtered.slice(start, start + state.pageSize);
  renderStudents(paginated);
  updatePagination(totalPages);
  updateBulkDeleteState();
}

function handleGradeFilterChange() {
  updateClassFilterOptions(elements.gradeFilter.value);
  applyFilters({ resetPage: true });
}

function handleClassFilterChange() {
  applyFilters({ resetPage: true });
}

function handleClearFilters() {
  elements.searchInput.value = '';
  elements.gradeFilter.value = '';
  updateClassFilterOptions('');
  applyFilters({ resetPage: true });
}

function handlePaginationClick(event) {
  const button = event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  const pageValue = button.dataset.page;
  const totalPages = Math.ceil(getFilteredStudents().length / state.pageSize);
  if (!totalPages) return;

  if (pageValue === 'prev') {
    state.currentPage = Math.max(1, state.currentPage - 1);
  } else if (pageValue === 'next') {
    state.currentPage = Math.min(totalPages, state.currentPage + 1);
  } else {
    state.currentPage = Number(pageValue) || 1;
  }

  applyFilters();
}

function handleBackdropClick(event) {
  if (event.target?.dataset?.close) {
    if (event.currentTarget === elements.modal) {
      closeModal();
    }
    if (event.currentTarget === elements.confirmModal) {
      closeConfirmModal();
    }
  }
}

function init() {
  initializeWheels();
  elements.addButton.addEventListener('click', () => openModal('add'));
  elements.deleteSelectedButton.addEventListener('click', handleDeleteSelected);
  elements.searchButton.addEventListener('click', handleSearch);
  elements.searchInput.addEventListener('input', handleSearchInput);
  elements.gradeFilter.addEventListener('change', handleGradeFilterChange);
  elements.classFilter.addEventListener('change', handleClassFilterChange);
  elements.clearFiltersButton.addEventListener('click', handleClearFilters);
  elements.pagination.addEventListener('click', handlePaginationClick);
  elements.body.addEventListener('click', handleTableClick);
  elements.body.addEventListener('change', handleTableChange);
  elements.form.addEventListener('submit', handleSubmit);
  elements.modalClose.addEventListener('click', closeModal);
  elements.modalCancel.addEventListener('click', closeModal);
  elements.modal.addEventListener('click', handleBackdropClick);
  elements.nameInput.addEventListener('blur', handleNameBlur);
  elements.firstNameInput.addEventListener('input', handleFirstNameInput);
  elements.selectAll.addEventListener('change', handleSelectAllChange);
  elements.confirmClose.addEventListener('click', closeConfirmModal);
  elements.confirmCancel.addEventListener('click', closeConfirmModal);
  elements.confirmSubmit.addEventListener('click', handleConfirmSubmit);
  elements.confirmModal.addEventListener('click', handleBackdropClick);

  loadStudents();
}

init();
