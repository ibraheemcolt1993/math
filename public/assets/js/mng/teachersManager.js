import { showToast } from '../ui/toast.js';

const API_BASE = '/api/ain/super/teachers';
const ACTIVE_ENDPOINT = '/api/ain/super/teachers-active';
const ROLE_ENDPOINT = '/api/ain/super/teachers/role';
const PASS_ENDPOINT = '/api/ain/super/teachers/pass';

const elements = {
  body: document.getElementById('teachersBody'),
  addButton: document.getElementById('btnAddTeacher'),
  modal: document.getElementById('teacherModal'),
  modalClose: document.getElementById('btnCloseTeacherModal'),
  modalCancel: document.getElementById('btnCancelTeacher'),
  form: document.getElementById('teacherForm'),
  usernameInput: document.getElementById('teacherUsername'),
  passwordInput: document.getElementById('teacherPassword'),
  roleSelect: document.getElementById('teacherRole'),
  passwordModal: document.getElementById('passwordModal'),
  passwordModalClose: document.getElementById('btnClosePasswordModal'),
  passwordCancel: document.getElementById('btnCancelPassword'),
  passwordForm: document.getElementById('passwordForm'),
  passwordInput: document.getElementById('newPasswordInput'),
  passwordLabel: document.getElementById('passwordUserLabel'),
  generatePassword: document.getElementById('btnGeneratePassword')
};

const state = {
  teachers: [],
  activeAdminId: null
};

function setLoading(message) {
  elements.body.innerHTML = `
    <tr>
      <td colspan="5" class="muted center">${message}</td>
    </tr>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function roleLabel(role) {
  return Number(role) === 1 ? 'مشرف (1)' : 'معلم (2)';
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function resetTeacherForm() {
  elements.form?.reset();
  if (elements.roleSelect) {
    elements.roleSelect.value = '2';
  }
}

function resetPasswordForm() {
  elements.passwordForm?.reset();
  if (elements.passwordLabel) {
    elements.passwordLabel.textContent = '—';
  }
  state.activeAdminId = null;
}

function closeTeacherModal() {
  closeModal(elements.modal);
  resetTeacherForm();
}

function closePasswordModal() {
  closeModal(elements.passwordModal);
  resetPasswordForm();
}

function renderTeachers() {
  if (!state.teachers.length) {
    setLoading('لا يوجد معلمين بعد.');
    return;
  }

  elements.body.innerHTML = state.teachers
    .map((teacher) => {
      const adminId = escapeHtml(teacher.AdminId);
      const username = escapeHtml(teacher.Username || '');
      const role = Number(teacher.Role);
      const isActive = Boolean(teacher.IsActive);
      return `
        <tr>
          <td class="ltr">${adminId}</td>
          <td>${username}</td>
          <td>
            <select class="input" data-action="role" data-admin-id="${adminId}">
              <option value="1" ${role === 1 ? 'selected' : ''}>مشرف (1)</option>
              <option value="2" ${role !== 1 ? 'selected' : ''}>معلم (2)</option>
            </select>
          </td>
          <td>
            <label class="row" style="gap: 8px; align-items: center;">
              <input type="checkbox" data-action="active" data-admin-id="${adminId}" ${isActive ? 'checked' : ''} />
              <span>${isActive ? 'مفعّل' : 'معطّل'}</span>
            </label>
          </td>
          <td>
            <button class="btn btn-outline btn-sm" type="button" data-action="reset-pass" data-admin-id="${adminId}">
              تغيير كلمة السر
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    credentials: 'include',
    ...(options || {})
  });
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

async function loadTeachers() {
  setLoading('جاري تحميل البيانات...');
  try {
    const data = await fetchJson(API_BASE);
    const list = Array.isArray(data) ? data : data.users || [];
    state.teachers = list;
    renderTeachers();
  } catch (error) {
    setLoading('تعذر تحميل البيانات.');
    showToast('خطأ', error.message, 'error');
  }
}

async function ensureSuperAccess() {
  try {
    const response = await fetch('/api/ain/me', {
      credentials: 'include',
      cache: 'no-store'
    });
    if (response.status === 401 || response.status === 403) {
      return false;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      return false;
    }
    const role = Number(data?.user?.role);
    if (role !== 1) {
      showToast('غير مصرح', 'هذه الصفحة مخصصة للمشرف فقط.', 'error');
      setLoading('غير مصرح بالدخول لهذه الصفحة.');
      setTimeout(() => {
        window.location.href = '/mng/students.html';
      }, 1200);
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}

function getTeacherById(adminId) {
  return state.teachers.find((teacher) => Number(teacher.AdminId) === Number(adminId));
}

function updateTeacher(updated) {
  const index = state.teachers.findIndex((teacher) => Number(teacher.AdminId) === Number(updated.AdminId));
  if (index >= 0) {
    state.teachers[index] = updated;
  }
  renderTeachers();
}

async function handleTeacherSubmit(event) {
  event.preventDefault();
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value.trim();
  const role = Number(elements.roleSelect.value) || 2;

  if (!username || !password) {
    showToast('تنبيه', 'يرجى إدخال اسم المستخدم وكلمة السر.', 'warning');
    return;
  }

  try {
    const result = await fetchJson(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        role: role === 1 ? 1 : 2
      })
    });

    if (result?.user) {
      state.teachers.unshift(result.user);
    }
    renderTeachers();
    closeModal(elements.modal);
    resetTeacherForm();
    showToast('تم', 'تمت إضافة المعلم بنجاح.', 'success');
  } catch (error) {
    showToast('خطأ', error.message, 'error');
  }
}

async function handleActiveToggle(target) {
  const adminId = Number(target.dataset.adminId);
  const isActive = Boolean(target.checked);

  try {
    const result = await fetchJson(ACTIVE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId, isActive })
    });

    if (result?.user) {
      updateTeacher(result.user);
      showToast('تم', 'تم تحديث حالة المعلم.', 'success');
    }
  } catch (error) {
    target.checked = !isActive;
    showToast('خطأ', error.message, 'error');
  }
}

async function handleRoleChange(target) {
  const adminId = Number(target.dataset.adminId);
  const role = Number(target.value);

  try {
    const result = await fetchJson(ROLE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId, role })
    });

    if (result?.user) {
      updateTeacher(result.user);
      showToast('تم', `تم تحديث الدور إلى ${roleLabel(role)}.`, 'success');
    }
  } catch (error) {
    const teacher = getTeacherById(adminId);
    if (teacher) {
      target.value = String(teacher.Role);
    }
    showToast('خطأ', error.message, 'error');
  }
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 10; i += 1) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  elements.passwordInput.value = password;
}

function openPasswordModal(adminId) {
  const teacher = getTeacherById(adminId);
  if (!teacher) return;
  state.activeAdminId = Number(adminId);
  if (elements.passwordLabel) {
    elements.passwordLabel.textContent = `المعلم: ${teacher.Username}`;
  }
  openModal(elements.passwordModal);
  elements.passwordInput.focus();
}

async function handlePasswordSubmit(event) {
  event.preventDefault();
  const adminId = state.activeAdminId;
  const password = elements.passwordInput.value.trim();

  if (!adminId) {
    showToast('خطأ', 'لا يوجد معلم محدد.', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('تنبيه', 'كلمة السر يجب أن تكون 6 أحرف على الأقل.', 'warning');
    return;
  }

  try {
    await fetchJson(PASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId, password })
    });
    showToast('تم', 'تم تحديث كلمة السر بنجاح.', 'success');
    closePasswordModal();
  } catch (error) {
    showToast('خطأ', error.message, 'error');
  }
}

function attachModalHandlers(modal, closeButtons) {
  if (!modal) return;
  modal.addEventListener('click', (event) => {
    if (event.target?.dataset?.close) {
      if (modal === elements.modal) {
        closeTeacherModal();
      } else if (modal === elements.passwordModal) {
        closePasswordModal();
      } else {
        closeModal(modal);
      }
    }
  });
  closeButtons.forEach((button) => {
    button?.addEventListener('click', () => {
      if (modal === elements.modal) {
        closeTeacherModal();
      } else if (modal === elements.passwordModal) {
        closePasswordModal();
      } else {
        closeModal(modal);
      }
    });
  });
}

function attachTableHandlers() {
  elements.body.addEventListener('change', (event) => {
    const target = event.target;
    if (target?.dataset?.action === 'active') {
      handleActiveToggle(target);
    }
    if (target?.dataset?.action === 'role') {
      handleRoleChange(target);
    }
  });

  elements.body.addEventListener('click', (event) => {
    const target = event.target;
    if (target?.dataset?.action === 'reset-pass') {
      openPasswordModal(target.dataset.adminId);
    }
  });
}

async function init() {
  setLoading('جاري التحقق من الصلاحيات...');
  const allowed = await ensureSuperAccess();
  if (!allowed) {
    return;
  }

  await loadTeachers();
}

if (elements.addButton) {
  elements.addButton.addEventListener('click', () => {
    resetTeacherForm();
    openModal(elements.modal);
  });
}

if (elements.form) {
  elements.form.addEventListener('submit', handleTeacherSubmit);
}

if (elements.passwordForm) {
  elements.passwordForm.addEventListener('submit', handlePasswordSubmit);
}

if (elements.generatePassword) {
  elements.generatePassword.addEventListener('click', generatePassword);
}

attachModalHandlers(elements.modal, [elements.modalClose, elements.modalCancel]);
attachModalHandlers(elements.passwordModal, [elements.passwordModalClose, elements.passwordCancel]);
attachTableHandlers();

init();
