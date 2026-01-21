import { showToast } from '../ui/toast.js';

const API_BASE = '/api/mng/students';

const elements = {
  body: document.getElementById('studentsBody'),
  addButton: document.getElementById('btnAddStudent'),
  searchInput: document.getElementById('searchInput'),
  searchButton: document.getElementById('btnSearch'),
  modal: document.getElementById('studentModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalClose: document.getElementById('btnCloseModal'),
  modalCancel: document.getElementById('btnCancel'),
  form: document.getElementById('studentForm'),
  submitButton: document.getElementById('btnSubmit'),
  studentIdInput: document.getElementById('studentIdInput'),
  birthYearSelect: document.getElementById('birthYearSelect'),
  birthMonthSelect: document.getElementById('birthMonthSelect'),
  birthDaySelect: document.getElementById('birthDaySelect'),
  nameInput: document.getElementById('nameInput'),
  firstNameInput: document.getElementById('firstNameInput'),
  gradeInput: document.getElementById('gradeInput'),
  classInput: document.getElementById('classInput')
};

const state = {
  students: [],
  mode: 'add'
};

let searchTimeout = null;
let firstNameTouched = false;

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

function buildSelectOptions(select, options, placeholder) {
  select.innerHTML = '';
  if (placeholder) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    select.appendChild(option);
  }
  options.forEach((item) => {
    const option = document.createElement('option');
    option.value = String(item.value);
    option.textContent = item.label;
    select.appendChild(option);
  });
}

function buildBirthDateSelects() {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 100;
  const years = [];
  for (let year = currentYear; year >= startYear; year -= 1) {
    years.push({ value: year, label: year });
  }
  buildSelectOptions(elements.birthYearSelect, years, 'السنة');

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return { value: month, label: padTwo(month) };
  });
  buildSelectOptions(elements.birthMonthSelect, months, 'الشهر');
  buildSelectOptions(elements.birthDaySelect, [], 'اليوم');
}

function updateBirthDays() {
  const year = parseInt(elements.birthYearSelect.value, 10);
  const month = parseInt(elements.birthMonthSelect.value, 10);
  const currentDay = elements.birthDaySelect.value;
  if (!year || !month) {
    buildSelectOptions(elements.birthDaySelect, [], 'اليوم');
    return;
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return { value: day, label: padTwo(day) };
  });
  buildSelectOptions(elements.birthDaySelect, days, 'اليوم');
  if (currentDay) {
    elements.birthDaySelect.value = currentDay;
  }
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

async function loadStudents(query = '') {
  setLoading('جاري تحميل البيانات...');
  try {
    const url = query ? `${API_BASE}?q=${encodeURIComponent(query)}` : API_BASE;
    const data = await fetchJson(url);
    const list = Array.isArray(data) ? data : data.students || [];
    state.students = list;
    renderStudents(list);
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

      return `
        <tr>
          <td class="ltr">${escapeHtml(studentId)}</td>
          <td class="ltr">${escapeHtml(birthYear)}</td>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(grade)}</td>
          <td>${escapeHtml(className)}</td>
          <td class="actions">
            <button class="btn btn-outline btn-sm" data-action="edit" data-id="${escapeHtml(studentId)}">تعديل</button>
            <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${escapeHtml(studentId)}">حذف</button>
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

  elements.studentIdInput.value = normalizeValue(student.StudentId || student.studentId);
  elements.nameInput.value = normalizeValue(student.Name || student.name);
  elements.firstNameInput.value = normalizeValue(student.FirstName || student.firstName);
  elements.gradeInput.value = normalizeValue(student.Grade || student.grade);
  elements.classInput.value = normalizeValue(student.Class || student.class);

  const birthDateParts = parseDateParts(student.BirthDate || student.birthDate);
  const fallbackBirthYear = normalizeValue(student.BirthYear || student.birthYear);
  if (birthDateParts) {
    elements.birthYearSelect.value = birthDateParts.year;
    elements.birthMonthSelect.value = birthDateParts.month;
    updateBirthDays();
    elements.birthDaySelect.value = birthDateParts.day;
  } else {
    elements.birthYearSelect.value = fallbackBirthYear;
    elements.birthMonthSelect.value = fallbackBirthYear ? '1' : '';
    updateBirthDays();
    elements.birthDaySelect.value = fallbackBirthYear ? '1' : '';
  }

  elements.studentIdInput.disabled = isEdit;

  elements.modal.classList.remove('hidden');
  elements.modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  elements.form.reset();
  buildBirthDateSelects();
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
    birthYear: normalizeValue(elements.birthYearSelect.value),
    birthMonth: normalizeValue(elements.birthMonthSelect.value),
    birthDay: normalizeValue(elements.birthDaySelect.value),
    name: normalizeValue(elements.nameInput.value),
    firstName: normalizeValue(elements.firstNameInput.value),
    grade: normalizeValue(elements.gradeInput.value),
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
    loadStudents(elements.searchInput.value.trim());
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

async function handleDelete(studentId) {
  const confirmed = window.confirm('هل أنت متأكد من حذف الطالب؟');
  if (!confirmed) return;

  try {
    await fetchJson(`${API_BASE}/${encodeURIComponent(studentId)}`, {
      method: 'DELETE'
    });
    showToast('تم الحذف', 'تم حذف الطالب بنجاح.', 'success');
    loadStudents(elements.searchInput.value.trim());
  } catch (error) {
    showToast('خطأ', error.message, 'error');
  }
}

function handleTableClick(event) {
  const action = event.target?.dataset?.action;
  const studentId = event.target?.dataset?.id;
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

function handleSearch() {
  const query = elements.searchInput.value.trim();
  loadStudents(query);
}

function handleSearchInput() {
  if (searchTimeout) window.clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(() => {
    handleSearch();
  }, 350);
}

function handleBackdropClick(event) {
  if (event.target?.dataset?.close) {
    closeModal();
  }
}

function init() {
  buildBirthDateSelects();
  elements.addButton.addEventListener('click', () => openModal('add'));
  elements.searchButton.addEventListener('click', handleSearch);
  elements.searchInput.addEventListener('input', handleSearchInput);
  elements.body.addEventListener('click', handleTableClick);
  elements.form.addEventListener('submit', handleSubmit);
  elements.modalClose.addEventListener('click', closeModal);
  elements.modalCancel.addEventListener('click', closeModal);
  elements.modal.addEventListener('click', handleBackdropClick);
  elements.birthYearSelect.addEventListener('change', updateBirthDays);
  elements.birthMonthSelect.addEventListener('change', updateBirthDays);
  elements.nameInput.addEventListener('blur', handleNameBlur);
  elements.firstNameInput.addEventListener('input', handleFirstNameInput);

  loadStudents();
}

init();
