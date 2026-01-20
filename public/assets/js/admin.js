import { API_PATHS } from './core/constants.js';
import { normalizeDigits } from './core/normalizeDigits.js';
import { showToast } from './ui/toast.js';

const LS_ADMIN_SESSION = 'math:admin:session';
const LS_ADMIN_STUDENTS = 'math:admin:students';
const LS_ADMIN_CARDS = 'math:admin:cards';
const ADMIN_STUDENTS_API = [API_PATHS.ADMIN_STUDENTS];
const ADMIN_CARDS_API = [API_PATHS.ADMIN_CARDS];
const ADMIN_LOGIN_API = API_PATHS.AUTH_LOGIN;
const ADMIN_PASSWORD_API = API_PATHS.AUTH_PASSWORD;
let students = [];
let cards = [];

document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('screen-admin-login');
  const adminScreen = document.getElementById('screen-admin');

  const btnLogin = document.getElementById('btnAdminLogin');
  const btnLogout = document.getElementById('btnAdminLogout');

  const inputUser = document.getElementById('adminUser');
  const inputPass = document.getElementById('adminPass');
  const inputOldPass = document.getElementById('adminOldPass');
  const inputNewPass = document.getElementById('adminNewPass');
  const inputNewPassConfirm = document.getElementById('adminNewPassConfirm');
  const btnChangePassword = document.getElementById('btnAdminChangePassword');
  const adminLoading = document.getElementById('adminLoading');

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

  btnLogin?.addEventListener('click', async () => {
    const user = String(inputUser?.value || '').trim();
    const pass = String(inputPass?.value || '').trim();

    if (!user || !pass) {
      showToast('تنبيه', 'يرجى إدخال اسم المستخدم وكلمة السر', 'warning');
      return;
    }
    try {
      setLoading(adminLoading, true, 'جاري التحقق من بيانات الدخول...');
      const result = await loginAdmin(user, pass);
      if (!result?.ok || !result.token) {
        showToast('تعذر تسجيل الدخول', 'تأكد من بيانات الدخول واتصال الخادم', 'error');
        return;
      }
      localStorage.setItem(
        LS_ADMIN_SESSION,
        JSON.stringify({ user, token: result.token || null, at: new Date().toISOString() })
      );
      showAdmin();
      showToast('مرحبًا', 'تم تسجيل الدخول بنجاح', 'success');
    } catch (error) {
      showToast('خطأ', formatAdminErrorMessage(error, 'تعذر تسجيل الدخول'), 'error');
    } finally {
      setLoading(adminLoading, false);
    }
  });

  btnLogout?.addEventListener('click', () => {
    localStorage.removeItem(LS_ADMIN_SESSION);
    showLogin();
    showToast('تم تسجيل الخروج', 'يمكنك تسجيل الدخول مجددًا', 'info');
  });

  btnChangePassword?.addEventListener('click', async () => {
    const user = getCurrentAdminUser();
    if (!user) {
      showToast('تنبيه', 'يرجى تسجيل الدخول أولًا', 'warning');
      return;
    }

    const currentPassword = String(inputOldPass?.value || '').trim();
    const newPassword = String(inputNewPass?.value || '').trim();
    const confirmPassword = String(inputNewPassConfirm?.value || '').trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast('تنبيه', 'يرجى تعبئة جميع حقول كلمة السر', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('تنبيه', 'كلمة السر الجديدة غير متطابقة', 'warning');
      return;
    }

    try {
      setLoading(adminLoading, true, 'جاري تحديث كلمة السر...');
      await changeAdminPassword(user, currentPassword, newPassword);
      inputOldPass.value = '';
      inputNewPass.value = '';
      inputNewPassConfirm.value = '';
      showToast('تم التحديث', 'تم تغيير كلمة السر بنجاح', 'success');
    } catch (error) {
      showToast('خطأ', formatAdminErrorMessage(error, 'تعذر تحديث كلمة السر'), 'error');
    } finally {
      setLoading(adminLoading, false);
    }
  });

  tabs.forEach((tabBtn) => {
    tabBtn.addEventListener('click', async () => {
      const tab = tabBtn.dataset.tab;
      tabs.forEach((btn) => btn.classList.toggle('is-active', btn === tabBtn));
      setScreenVisibility(panelStudents, tab === 'students');
      setScreenVisibility(panelCards, tab === 'cards');

      if (tab === 'students') {
        const cached = readLocalJson(LS_ADMIN_STUDENTS);
        if (cached && Array.isArray(cached)) {
          students = cached.map(normalizeStudent);
        }
        renderStudents(studentsTable);
        await refreshStudents({ silent: Boolean(cached), showStatus: true });
        renderStudents(studentsTable);
      }

      if (tab === 'cards') {
        const cachedCards = readLocalJson(LS_ADMIN_CARDS);
        if (cachedCards && Array.isArray(cachedCards)) {
          cards = cachedCards.map(normalizeCard);
        }
        renderCards(cardsList);
        await refreshCards({ silent: Boolean(cachedCards), showStatus: true });
        renderCards(cardsList);
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
    if (!btnSaveStudents) return;
    const original = btnSaveStudents.textContent;
    btnSaveStudents.disabled = true;
    btnSaveStudents.textContent = 'جارٍ الحفظ...';
    try {
      showToast('جارٍ الحفظ', 'جاري حفظ بيانات الطلاب', 'info');
      await saveStudents();
      showToast('تم الحفظ', 'تم حفظ بيانات الطلاب في قاعدة البيانات', 'success');
    } catch (error) {
      showToast('خطأ', formatAdminErrorMessage(error, 'تعذر حفظ بيانات الطلاب'), 'error');
    } finally {
      btnSaveStudents.disabled = false;
      btnSaveStudents.textContent = original || 'حفظ الآن';
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
      className: '',
      sections: [],
    };

    cards.unshift(newCard);
    localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));
    renderCards(cardsList);
    window.location.href = `/admin-card-builder.html?id=${encodeURIComponent(newCard.week)}`;
  });

  btnSaveCards?.addEventListener('click', async () => {
    if (!btnSaveCards) return;
    const original = btnSaveCards.textContent;
    btnSaveCards.disabled = true;
    btnSaveCards.textContent = 'جارٍ الحفظ...';
    try {
      showToast('جارٍ الحفظ', 'جاري حفظ بيانات البطاقات', 'info');
      await saveCards();
      showToast('تم الحفظ', 'تم حفظ بيانات البطاقات في قاعدة البيانات', 'success');
    } catch (error) {
      showToast('خطأ', formatAdminErrorMessage(error, 'تعذر حفظ بيانات البطاقات'), 'error');
    } finally {
      btnSaveCards.disabled = false;
      btnSaveCards.textContent = original || 'حفظ الآن';
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
      const cleaned = normalizeDigits(target.value).replace(/[^0-9]/g, '');
      target.value = cleaned;
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

  cardsList?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    const action = target.dataset.action;
    if (action !== 'delete-card') return;
    const index = Number(target.dataset.index);
    if (!Number.isFinite(index)) return;

    cards.splice(index, 1);
    localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));
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

    const { hasCachedStudents, hasCachedCards } = loadData();
    renderStudents(studentsTable);
    renderCards(cardsList);

    refreshStudents({ silent: hasCachedStudents, showStatus: true })
      .then(() => renderStudents(studentsTable))
      .catch(() => {});
    refreshCards({ silent: hasCachedCards, showStatus: true })
      .then(() => renderCards(cardsList))
      .catch(() => {});
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
  return Boolean(getAdminToken());
}

function loadData() {
  const cachedStudents = readLocalJson(LS_ADMIN_STUDENTS);
  if (cachedStudents && Array.isArray(cachedStudents)) {
    students = cachedStudents.map(normalizeStudent);
  }

  const cachedCards = readLocalJson(LS_ADMIN_CARDS);
  if (cachedCards && Array.isArray(cachedCards)) {
    cards = cachedCards.map(normalizeCard);
  }
  return {
    hasCachedStudents: Boolean(cachedStudents),
    hasCachedCards: Boolean(cachedCards),
  };
}

async function refreshStudents({ silent = false, showStatus = false } = {}) {
  const adminLoading = document.getElementById('adminLoading');
  if (showStatus) {
    showToast('جاري التحميل', 'جاري تحميل بيانات الطلاب', 'info');
  }
  try {
    setLoading(adminLoading, true, 'جاري تحميل بيانات الطلاب...');
    students = await loadStudentsFromApi();
    localStorage.setItem(LS_ADMIN_STUDENTS, JSON.stringify(students));
    if (showStatus) {
      showToast('تم التحميل', 'تم تحميل بيانات الطلاب بنجاح', 'success');
    }
  } catch (error) {
    if (!silent) {
      if (isNetworkError(error)) {
        showToast('تنبيه', 'تعذر الاتصال بالخادم، تم عرض نسخة محلية للطلاب', 'warning');
        return;
      }

      showToast('خطأ', formatAdminErrorMessage(error, 'تعذر تحميل بيانات الطلاب'), 'error');
    }
    students = [];
  } finally {
    setLoading(adminLoading, false);
  }
}

async function refreshCards({ silent = false, showStatus = false } = {}) {
  const adminLoading = document.getElementById('adminLoading');
  if (showStatus) {
    showToast('جاري التحميل', 'جاري تحميل بيانات البطاقات', 'info');
  }
  try {
    setLoading(adminLoading, true, 'جاري تحميل بيانات البطاقات...');
    cards = mergeCardMetadata(await loadCardsFromApi());
    localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));
    if (showStatus) {
      showToast('تم التحميل', 'تم تحميل بيانات البطاقات بنجاح', 'success');
    }
  } catch (error) {
    if (!silent) {
      if (isNetworkError(error)) {
        showToast('تنبيه', 'تعذر الاتصال بالخادم، تم عرض نسخة محلية للبطاقات', 'warning');
        return;
      }

      showToast('خطأ', formatAdminErrorMessage(error, 'تعذر تحميل بيانات البطاقات'), 'error');
    }
    cards = [];
  } finally {
    setLoading(adminLoading, false);
  }
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

  const grouped = groupCardsByClass(cards);
  grouped.forEach(({ groupName, items }) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'admin-card-group';
    groupEl.innerHTML = `<h4 class="admin-card-group-title">${escapeValue(groupName)}</h4>`;

    items.forEach((card) => {
      const cardIndex = cards.indexOf(card);
      const cardEl = document.createElement('div');
      cardEl.className = 'admin-card';
      cardEl.innerHTML = `
        <div>
          <strong>الأسبوع ${escapeValue(card.week ?? '--')}</strong>
          <div>${escapeValue(card.title || 'بطاقة بدون عنوان')}</div>
        </div>
        <div class="card-actions">
          <a class="btn btn-outline btn-sm" href="/admin-card-builder.html?id=${encodeURIComponent(card.week ?? '')}">
            تعديل محتوى البطاقة
          </a>
          <button class="btn btn-ghost btn-sm" type="button" data-action="delete-card" data-index="${cardIndex}">حذف البطاقة</button>
        </div>
      `;
      groupEl.appendChild(cardEl);
    });

    container.appendChild(groupEl);
  });
}

function escapeValue(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatAdminErrorMessage(error, fallback) {
  const message = String(error?.message || fallback);

  if (message === 'DUPLICATE_STUDENT_ID') {
    return 'يوجد تكرار في رقم الهوية. يرجى التأكد من عدم تكرار رقم الطالب.';
  }

  if (message === 'BAD_REQUEST') {
    return 'يرجى تعبئة جميع حقول البيانات قبل الحفظ.';
  }

  if (message === 'EMPTY_STUDENT_LIST') {
    return 'لا يمكن حذف جميع الطلاب دون تأكيد الحذف الشامل.';
  }

  if (message === 'INVALID_PREREQ_WEEK') {
    return 'رقم المتطلب السابق غير صالح. تأكد من أن الأسبوع موجود.';
  }

  if (message === 'DB_ERROR') {
    return 'تعذر الاتصال بقاعدة البيانات. يرجى المحاولة لاحقًا.';
  }

  if (message === 'INVALID_ADMIN_LOGIN') {
    return 'بيانات الدخول غير صحيحة.';
  }

  if (message === 'ADMIN_DISABLED') {
    return 'حساب الإدارة غير مفعّل.';
  }

  if (message === 'ADMIN_NOT_FOUND') {
    return 'لم يتم العثور على حساب الإدارة.';
  }

  if (message === 'ADMIN_AUTH_REQUIRED') {
    return 'يلزم تسجيل الدخول للوصول إلى لوحة الإدارة.';
  }

  if (message === 'ADMIN_AUTH_INVALID') {
    return 'جلسة الإدارة غير صالحة. يرجى تسجيل الدخول من جديد.';
  }

  if (message === 'ADMIN_AUTH_MISMATCH') {
    return 'لا يمكن تحديث كلمة السر لهذا المستخدم.';
  }

  return message;
}

async function saveStudents() {
  await saveStudentsToApi(students);
  students = await loadStudentsFromApi();
  localStorage.setItem(LS_ADMIN_STUDENTS, JSON.stringify(students));
}

async function saveCards() {
  await saveCardsToApi(cards);
  cards = await loadCardsFromApi();
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
    className: row.className ?? row.class ?? '',
    sections: Array.isArray(row.sections) ? row.sections : [],
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
  for (const endpoint of ADMIN_STUDENTS_API) {
    const res = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        ...getAdminAuthHeaders(),
      },
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch (error) {
      payload = null;
    }

    if (res.status === 404) {
      continue;
    }

    if (!res.ok) {
      const message = payload?.message || payload?.error || 'تعذر تحميل بيانات الطلاب';
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    var studentsPayload = Array.isArray(payload) ? payload : payload?.students;
    if (!Array.isArray(studentsPayload)) {
      throw new Error('تعذر تحميل بيانات الطلاب');
    }

    return studentsPayload.map(normalizeStudent);
  }

  const err = new Error('تعذر تحميل بيانات الطلاب');
  err.status = 404;
  throw err;
}

async function saveStudentsToApi(studentsArray) {
  const payload = {
    students: studentsArray.map((student) => ({
      studentId: normalizeDigits(String(student.id || '').trim()),
      birthYear: normalizeDigits(String(student.birthYear || '').trim()),
      firstName: student.firstName,
      fullName: student.fullName,
      class: student.class,
      StudentId: normalizeDigits(String(student.id || '').trim()),
      BirthYear: normalizeDigits(String(student.birthYear || '').trim()),
      FirstName: student.firstName,
      FullName: student.fullName,
      Class: student.class,
    })),
    replaceAll: studentsArray.length === 0,
  };

  for (const endpoint of ADMIN_STUDENTS_API) {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    let responsePayload = null;
    try {
      responsePayload = await res.json();
    } catch (error) {
      responsePayload = null;
    }

    if (res.status === 404) {
      continue;
    }

    if (!res.ok || responsePayload?.ok === false) {
      const message = responsePayload?.message || responsePayload?.error || 'تعذر حفظ بيانات الطلاب';
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    return;
  }

  const err = new Error('تعذر حفظ بيانات الطلاب');
  err.status = 404;
  throw err;
}

async function loadCardsFromApi() {
  for (const endpoint of ADMIN_CARDS_API) {
    const res = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        ...getAdminAuthHeaders(),
      },
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch (error) {
      payload = null;
    }

    if (res.status === 404) {
      continue;
    }

    if (!res.ok) {
      const message = payload?.message || payload?.error || 'تعذر تحميل بيانات البطاقات';
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    const cardsPayload = Array.isArray(payload) ? payload : payload?.cards;
    if (!Array.isArray(cardsPayload)) {
      throw new Error('تعذر تحميل بيانات البطاقات');
    }

    return cardsPayload.map(normalizeCard);
  }

  const err = new Error('تعذر تحميل بيانات البطاقات');
  err.status = 404;
  throw err;
}

function mergeCardMetadata(remoteCards) {
  const cached = readLocalJson(LS_ADMIN_CARDS);
  const cacheMap = new Map(
    Array.isArray(cached)
      ? cached.map((card) => [String(card.week), normalizeCard(card)])
      : [],
  );

  return remoteCards.map((card) => {
    const cachedCard = cacheMap.get(String(card.week));
    return {
      ...card,
      className: cachedCard?.className || card.className || '',
      sections: Array.isArray(cachedCard?.sections) ? cachedCard.sections : card.sections || [],
    };
  });
}

async function saveCardsToApi(cardsArray) {
  const payload = {
    cards: cardsArray.map((card) => ({
      week: card.week,
      title: card.title,
      prereq: card.prereq,
    })),
  };

  for (const endpoint of ADMIN_CARDS_API) {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    let responsePayload = null;
    try {
      responsePayload = await res.json();
    } catch (error) {
      responsePayload = null;
    }

    if (res.status === 404) {
      continue;
    }

    if (!res.ok || responsePayload?.ok === false) {
      const message = responsePayload?.message || responsePayload?.error || 'تعذر حفظ بيانات البطاقات';
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    return;
  }

  const err = new Error('تعذر حفظ بيانات البطاقات');
  err.status = 404;
  throw err;
}

function isNetworkError(error) {
  return error instanceof TypeError && !('status' in error);
}

function getCurrentAdminUser() {
  try {
    const raw = localStorage.getItem(LS_ADMIN_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || null;
  } catch {
    return null;
  }
}

async function loginAdmin(username, password) {
  try {
    const res = await fetch(ADMIN_LOGIN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (res.status === 404) {
      return { ok: false, token: null };
    }

    const payload = await res.json().catch(() => null);
    if (!res.ok || payload?.ok === false) {
      return { ok: false, token: null };
    }
    return { ok: true, token: payload?.token || null };
  } catch (error) {
    if (isNetworkError(error)) {
      return { ok: false, token: null };
    }
    throw error;
  }
}

async function changeAdminPassword(username, currentPassword, newPassword) {
  const res = await fetch(ADMIN_PASSWORD_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
    body: JSON.stringify({ username, currentPassword, newPassword }),
  });

  const payload = await res.json().catch(() => null);
  if (res.status === 404) {
    throw new Error('تعذر الاتصال بالخادم');
  }
  if (!res.ok || payload?.ok === false) {
    const message = payload?.message || payload?.error || 'تعذر تحديث كلمة السر';
    throw new Error(message);
  }
}

function groupCardsByClass(cardsList) {
  const grouped = new Map();
  cardsList.forEach((card) => {
    const key = card.className?.trim() || 'بطاقات بدون صف';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(card);
  });

  return Array.from(grouped.entries()).map(([groupName, items]) => ({
    groupName,
    items: items.sort((a, b) => Number(a.week) - Number(b.week)),
  }));
}

function setLoading(overlay, isVisible, message) {
  if (!overlay) return;
  overlay.classList.toggle('hidden', !isVisible);
  overlay.toggleAttribute('hidden', !isVisible);
  if (message) {
    const text = overlay.querySelector('span:last-child');
    if (text) text.textContent = message;
  }
}

function getAdminAuthHeaders() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getAdminToken() {
  try {
    const raw = localStorage.getItem(LS_ADMIN_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}
