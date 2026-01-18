import { fetchJson } from './core/api.js';
import { DATA_PATHS } from './core/constants.js';
import { showToast } from './ui/toast.js';

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Aa@232323445566';

const LS_ADMIN_SESSION = 'math:admin:session';
const LS_ADMIN_STUDENTS = 'math:admin:students';
const LS_ADMIN_CARDS = 'math:admin:cards';
const ADMIN_STUDENTS_API = '/api/adminstudents';
let students = [];
let cards = [];

document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('screen-admin-login');
  const adminScreen = document.getElementById('screen-admin');

  const btnLogin = document.getElementById('btnAdminLogin');
  const btnLogout = document.getElementById('btnAdminLogout');

  const inputUser = document.getElementById('adminUser');
  const inputPass = document.getElementById('adminPass');

  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  const panelStudents = document.getElementById('tab-students');
  const panelCards = document.getElementById('tab-cards');

  const studentsTable = document.getElementById('studentsTable');
  const btnAddStudent = document.getElementById('btnAddStudent');
  const btnSaveStudents = document.getElementById('btnSaveStudents');

  const cardsList = document.getElementById('cardsList');
  const btnAddCard = document.getElementById('btnAddCard');
  const btnSaveCards = document.getElementById('btnSaveCards');

  hideAllScreens();

  if (isLoggedIn()) {
    showAdmin();
  } else {
    showLogin();
  }

  btnLogin?.addEventListener('click', () => {
    const user = String(inputUser?.value || '').trim();
    const pass = String(inputPass?.value || '').trim();

    if (!user || !pass) {
      showToast('تنبيه', 'يرجى إدخال اسم المستخدم وكلمة السر', 'warning');
      return;
    }

    if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
      showToast('بيانات غير صحيحة', 'تأكد من بيانات الدخول', 'error');
      return;
    }

    localStorage.setItem(LS_ADMIN_SESSION, new Date().toISOString());
    showAdmin();
    showToast('مرحبًا', 'تم تسجيل الدخول بنجاح', 'success');
  });

  btnLogout?.addEventListener('click', () => {
    localStorage.removeItem(LS_ADMIN_SESSION);
    showLogin();
    showToast('تم تسجيل الخروج', 'يمكنك تسجيل الدخول مجددًا', 'info');
  });

  tabs.forEach((tabBtn) => {
    tabBtn.addEventListener('click', async () => {
      const tab = tabBtn.dataset.tab;
      tabs.forEach((btn) => btn.classList.toggle('is-active', btn === tabBtn));
      setScreenVisibility(panelStudents, tab === 'students');
      setScreenVisibility(panelCards, tab === 'cards');

      if (tab === 'students') {
        await reloadStudentsFromApi();
        renderStudents(studentsTable);
      }
    });
  });

  btnAddStudent?.addEventListener('click', () => {
    students.unshift({
      id: '',
      birthYear: '',
      firstName: '',
      fullName: '',
      class: '',
    });
    renderStudents(studentsTable);
  });

  btnSaveStudents?.addEventListener('click', async () => {
    try {
      await saveStudents();
      showToast('تم الحفظ', 'تم حفظ بيانات الطلاب في قاعدة البيانات', 'success');
    } catch (error) {
      showToast('خطأ', error.message || 'تعذر حفظ بيانات الطلاب', 'error');
    }
  });

  btnAddCard?.addEventListener('click', () => {
    const maxWeek = cards.reduce((max, card) => {
      const value = Number(card.week);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);

    const newCard = {
      week: maxWeek + 1,
      title: 'بطاقة جديدة',
      prereq: null,
    };

    cards.unshift(newCard);
    renderCards(cardsList);
  });

  btnSaveCards?.addEventListener('click', async () => {
    try {
      await saveCards();
      showToast('تم الحفظ', 'تم حفظ بيانات البطاقات في المتصفح', 'success');
    } catch (error) {
      showToast('خطأ', error.message || 'تعذر حفظ بيانات البطاقات', 'error');
    }
  });

  studentsTable?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const index = Number(target.dataset.index);
    const field = target.dataset.field;

    if (!Number.isFinite(index) || !field) return;

    if (!students[index]) return;

    if (field === 'id' || field === 'birthYear') {
      target.value = target.value.replace(/[^0-9]/g, '');
    }

    students[index][field] = target.value.trim();
  });

  studentsTable?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    if (target.dataset.action !== 'delete-student') return;
    const index = Number(target.dataset.index);
    if (!Number.isFinite(index)) return;

    students.splice(index, 1);
    renderStudents(studentsTable);
  });

  cardsList?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;

    const index = Number(target.dataset.index);
    const field = target.dataset.field;

    if (!Number.isFinite(index) || !field) return;
    const card = cards[index];
    if (!card) return;

    if (field === 'week' || field === 'prereq') {
      const cleaned = target.value.replace(/[^0-9]/g, '');
      target.value = cleaned;
      card[field] = cleaned === '' ? null : Number(cleaned);
    } else {
      card[field] = target.value.trim();
    }
    refreshCardHeaders();
  });

  cardsList?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    const action = target.dataset.action;
    if (action !== 'delete-card') return;
    const index = Number(target.dataset.index);
    if (!Number.isFinite(index)) return;

    cards.splice(index, 1);
    renderCards(cardsList);
  });

  function hideAllScreens() {
    setScreenVisibility(loginScreen, false);
    setScreenVisibility(adminScreen, false);
  }

  function showLogin() {
    hideAllScreens();
    setScreenVisibility(loginScreen, true);
    setScreenVisibility(adminScreen, false);
    document.body.classList.remove('is-loading');
    btnLogout?.classList.add('hidden');
  }

async function showAdmin() {
    hideAllScreens();
    setScreenVisibility(adminScreen, true);
    document.body.classList.remove('is-loading');
    btnLogout?.classList.remove('hidden');

    await loadData();
    renderStudents(studentsTable);
    renderCards(cardsList);
  }

  function setScreenVisibility(screen, isVisible) {
    if (!screen) return;
    screen.classList.toggle('hidden', !isVisible);
    screen.toggleAttribute('hidden', !isVisible);
    if (isVisible) {
      screen.style.removeProperty('display');
      if (!screen.getAttribute('style')) {
        screen.removeAttribute('style');
      }
    } else {
      screen.style.display = 'none';
    }
  }
});

function isLoggedIn() {
  return Boolean(localStorage.getItem(LS_ADMIN_SESSION));
}

async function loadData() {
  await Promise.all([loadStudents(), loadCards()]);
}

async function loadStudents() {
  try {
    students = await loadStudentsFromApi();
    localStorage.setItem(LS_ADMIN_STUDENTS, JSON.stringify(students));
  } catch (error) {
    if (isNetworkError(error)) {
      const stored = readLocalJson(LS_ADMIN_STUDENTS);
      if (stored && Array.isArray(stored)) {
        students = stored.map(normalizeStudent);
        showToast('تنبيه', 'تعذر الاتصال بالخادم، تم عرض نسخة محلية للطلاب', 'warning');
        return;
      }
    }

    showToast('خطأ', error.message || 'تعذر تحميل بيانات الطلاب', 'error');
    students = [];
  }
}

async function loadCards() {
  const stored = readLocalJson(LS_ADMIN_CARDS);
  if (stored && Array.isArray(stored)) {
    cards = stored.map(normalizeCard);
    return;
  }

  const data = await fetchJson(DATA_PATHS.CARDS, { noStore: true });
  cards = Array.isArray(data) ? data.map(normalizeCard) : [];
}

function renderStudents(container) {
  if (!container) return;
  container.innerHTML = '';

  students.forEach((student, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input class="input ltr" data-index="${index}" data-field="id" value="${escapeValue(student.id)}" placeholder="مثال: 123456" /></td>
      <td><input class="input ltr" data-index="${index}" data-field="birthYear" value="${escapeValue(student.birthYear)}" placeholder="2012" /></td>
      <td><input class="input" data-index="${index}" data-field="firstName" value="${escapeValue(student.firstName)}" placeholder="الاسم الأول" /></td>
      <td><input class="input" data-index="${index}" data-field="fullName" value="${escapeValue(student.fullName)}" placeholder="الاسم الكامل" /></td>
      <td><input class="input" data-index="${index}" data-field="class" value="${escapeValue(student.class)}" placeholder="7/1" /></td>
      <td><button class="btn btn-ghost btn-sm" type="button" data-action="delete-student" data-index="${index}">حذف</button></td>
    `;
    container.appendChild(row);
  });
}

function renderCards(container) {
  if (!container) return;
  container.innerHTML = '';

  cards.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'admin-card';

    cardEl.innerHTML = `
      <h4>بطاقة الأسبوع ${escapeValue(card.week ?? '--')}</h4>
      <div class="field">
        <label class="label">رقم الأسبوع</label>
        <input class="input ltr" data-index="${index}" data-field="week" value="${escapeValue(card.week)}" />
      </div>
      <div class="field">
        <label class="label">عنوان البطاقة</label>
        <input class="input" data-index="${index}" data-field="title" value="${escapeValue(card.title)}" />
      </div>
      <div class="field">
        <label class="label">المتطلب السابق (اختياري)</label>
        <input class="input ltr" data-index="${index}" data-field="prereq" value="${escapeValue(card.prereq ?? '')}" placeholder="مثال: 999" />
      </div>
      <div class="card-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-action="delete-card" data-index="${index}">حذف البطاقة</button>
      </div>
    `;

    container.appendChild(cardEl);
  });
}

function refreshCardHeaders() {
  document.querySelectorAll('.admin-card').forEach((cardEl, index) => {
    const title = cardEl.querySelector('h4');
    if (!title) return;
    const weekValue = cards[index]?.week ?? '--';
    title.textContent = `بطاقة الأسبوع ${weekValue}`;
  });
}

function escapeValue(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function saveStudents() {
  await saveStudentsToApi(students);
  students = await loadStudentsFromApi();
  localStorage.setItem(LS_ADMIN_STUDENTS, JSON.stringify(students));
}

async function saveCards() {
  localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));
}

function normalizeStudent(row) {
  return {
    id: row.StudentId ?? row.studentId ?? row.id ?? '',
    birthYear: row.BirthYear ?? row.birthYear ?? '',
    firstName: row.FirstName ?? row.firstName ?? '',
    fullName: row.FullName ?? row.fullName ?? '',
    class: row.Class ?? row.class ?? '',
  };
}

function normalizeCard(row) {
  return {
    week: row.Week ?? row.week ?? '',
    title: row.Title ?? row.title ?? '',
    prereq: row.PrereqWeek ?? row.prereq ?? null,
  };
}

function readLocalJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadStudentsFromApi() {
  const res = await fetch(ADMIN_STUDENTS_API, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch (error) {
    payload = null;
  }

  if (!res.ok) {
    const message = payload?.message || payload?.error || 'تعذر تحميل بيانات الطلاب';
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (!payload?.ok || !Array.isArray(payload.students)) {
    throw new Error('تعذر تحميل بيانات الطلاب');
  }

  return payload.students.map(normalizeStudent);
}

async function saveStudentsToApi(studentsArray) {
  const payload = {
    students: studentsArray.map((student) => ({
      StudentId: student.id,
      BirthYear: student.birthYear,
      FirstName: student.firstName,
      FullName: student.fullName,
      Class: student.class,
    })),
  };

  const res = await fetch(ADMIN_STUDENTS_API, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let responsePayload = null;
  try {
    responsePayload = await res.json();
  } catch (error) {
    responsePayload = null;
  }

  if (!res.ok || responsePayload?.ok === false) {
    const message = responsePayload?.message || responsePayload?.error || 'تعذر حفظ بيانات الطلاب';
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
}

async function reloadStudentsFromApi() {
  try {
    students = await loadStudentsFromApi();
    localStorage.setItem(LS_ADMIN_STUDENTS, JSON.stringify(students));
  } catch (error) {
    if (isNetworkError(error)) {
      const stored = readLocalJson(LS_ADMIN_STUDENTS);
      if (stored && Array.isArray(stored)) {
        students = stored.map(normalizeStudent);
        showToast('تنبيه', 'تعذر الاتصال بالخادم، تم عرض نسخة محلية للطلاب', 'warning');
        return;
      }
    }
    showToast('خطأ', error.message || 'تعذر تحميل بيانات الطلاب', 'error');
  }
}

function isNetworkError(error) {
  return error instanceof TypeError && !('status' in error);
}
