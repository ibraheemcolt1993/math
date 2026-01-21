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
  birthYearInput: document.getElementById('birthYearInput'),
  nameInput: document.getElementById('nameInput'),
  gradeInput: document.getElementById('gradeInput'),
  classInput: document.getElementById('classInput')
};

const state = {
  students: [],
  mode: 'add'
};

let searchTimeout = null;

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

  elements.modalTitle.textContent = isEdit ? 'تعديل بيانات الطالب' : 'إضافة طالب';
  elements.submitButton.textContent = isEdit ? 'حفظ التعديلات' : 'إضافة الطالب';

  elements.studentIdInput.value = normalizeValue(student.StudentId || student.studentId);
  elements.birthYearInput.value = normalizeValue(student.BirthYear || student.birthYear);
  elements.nameInput.value = normalizeValue(student.Name || student.name);
  elements.gradeInput.value = normalizeValue(student.Grade || student.grade);
  elements.classInput.value = normalizeValue(student.Class || student.class);

  elements.studentIdInput.disabled = isEdit;

  elements.modal.classList.remove('hidden');
  elements.modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  elements.form.reset();
  elements.studentIdInput.disabled = false;
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
    birthYear: normalizeValue(elements.birthYearInput.value),
    name: normalizeValue(elements.nameInput.value),
    grade: normalizeValue(elements.gradeInput.value),
    class: normalizeValue(elements.classInput.value)
  };

  if (!payload.studentId || !payload.birthYear || !payload.name) {
    showToast('تنبيه', 'يرجى تعبئة الحقول المطلوبة.', 'warning');
    return;
  }

  try {
    if (state.mode === 'add') {
      await fetchJson(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('تمت الإضافة', 'تم إضافة الطالب بنجاح.', 'success');
    } else {
      await fetchJson(`${API_BASE}/${encodeURIComponent(payload.studentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthYear: payload.birthYear,
          name: payload.name,
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
  elements.addButton.addEventListener('click', () => openModal('add'));
  elements.searchButton.addEventListener('click', handleSearch);
  elements.searchInput.addEventListener('input', handleSearchInput);
  elements.body.addEventListener('click', handleTableClick);
  elements.form.addEventListener('submit', handleSubmit);
  elements.modalClose.addEventListener('click', closeModal);
  elements.modalCancel.addEventListener('click', closeModal);
  elements.modal.addEventListener('click', handleBackdropClick);

  loadStudents();
}

init();
