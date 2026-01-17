import { fetchJson } from './core/api.js';
import { showToast } from './ui/toast.js';

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Aa@232323445566';

const LS_ADMIN_SESSION = 'math:admin:session';
const LS_ADMIN_STUDENTS = 'math:admin:students';
const LS_ADMIN_CARDS = 'math:admin:cards';

const STUDENTS_PATH = '/data/students.json';
const CARDS_PATH = '/data/cards.json';

let studentsMeta = { version: 1, note: '' };
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
    tabBtn.addEventListener('click', () => {
      const tab = tabBtn.dataset.tab;
      tabs.forEach((btn) => btn.classList.toggle('is-active', btn === tabBtn));
      setScreenVisibility(panelStudents, tab === 'students');
      setScreenVisibility(panelCards, tab === 'cards');
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
    persistStudents();
  });

  btnSaveStudents?.addEventListener('click', () => {
    persistStudents();
    showToast('تم الحفظ', 'تم حفظ بيانات الطلاب محليًا', 'success');
  });

  btnAddCard?.addEventListener('click', () => {
    const maxWeek = cards.reduce((max, card) => {
      const value = Number(card.week);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);

    const newCard = {
      id: generateId('card'),
      week: maxWeek + 1,
      title: 'بطاقة جديدة',
      prereq: null,
      items: [],
      form: {
        sections: [],
      },
    };

    cards.unshift(newCard);
    renderCards(cardsList);
    persistCards();
    openCardBuilder(newCard.id);
  });

  btnSaveCards?.addEventListener('click', () => {
    persistCards();
    showToast('تم الحفظ', 'تم حفظ بيانات البطاقات محليًا', 'success');
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
    persistStudents();
  });

  studentsTable?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    if (target.dataset.action !== 'delete-student') return;
    const index = Number(target.dataset.index);
    if (!Number.isFinite(index)) return;

    students.splice(index, 1);
    renderStudents(studentsTable);
    persistStudents();
  });

  cardsList?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;

    const index = Number(target.dataset.index);
    const field = target.dataset.field;

    if (!Number.isFinite(index) || !field) return;
    const card = cards[index];
    if (!card) return;

    if (field === 'items') {
      const lines = target.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      card.items = lines;
    } else if (field === 'week' || field === 'prereq') {
      const cleaned = target.value.replace(/[^0-9]/g, '');
      target.value = cleaned;
      card[field] = cleaned === '' ? null : Number(cleaned);
    } else {
      card[field] = target.value.trim();
    }

    persistCards();
    refreshCardHeaders();
  });

  cardsList?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    const action = target.dataset.action;
    if (action === 'edit-card') {
      const cardId = target.dataset.id;
      if (cardId) {
        openCardBuilder(cardId);
      }
      return;
    }

    if (action !== 'delete-card') return;
    const index = Number(target.dataset.index);
    if (!Number.isFinite(index)) return;

    cards.splice(index, 1);
    renderCards(cardsList);
    persistCards();
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
  const stored = readLocalJson(LS_ADMIN_STUDENTS);
  if (stored && Array.isArray(stored.students)) {
    studentsMeta = {
      version: stored.version ?? 1,
      note: stored.note ?? '',
    };
    students = stored.students;
    return;
  }

  const data = await fetchJson(STUDENTS_PATH, { noStore: true });
  studentsMeta = {
    version: data.version ?? 1,
    note: data.note ?? '',
  };
  students = Array.isArray(data.students) ? data.students : [];
}

async function loadCards() {
  const stored = readLocalJson(LS_ADMIN_CARDS);
  if (stored && Array.isArray(stored)) {
    cards = stored;
    if (ensureCardsShape(cards)) {
      persistCards();
    }
    return;
  }

  const data = await fetchJson(CARDS_PATH, { noStore: true });
  cards = Array.isArray(data) ? data : [];
  if (ensureCardsShape(cards)) {
    persistCards();
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

  cards.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'admin-card';

    const itemsText = Array.isArray(card.items) ? card.items.join('\n') : '';
    const sections = card.form?.sections ?? [];
    const questionCount = sections.reduce(
      (total, section) => total + (Array.isArray(section.questions) ? section.questions.length : 0),
      0,
    );

    cardEl.innerHTML = `
      <h4>بطاقة الأسبوع ${escapeValue(card.week ?? '--')}</h4>
      <p class="small">عدد الأقسام: ${sections.length} • عدد الأسئلة: ${questionCount}</p>
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
      <div class="field">
        <label class="label">عناصر البطاقة (كل عنصر بسطر)</label>
        <textarea class="input" data-index="${index}" data-field="items" placeholder="مثال: سؤال 1">${escapeValue(itemsText)}</textarea>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-sm" type="button" data-action="edit-card" data-id="${escapeValue(card.id)}">تحرير النموذج</button>
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

function persistStudents() {
  const payload = {
    version: studentsMeta.version,
    note: studentsMeta.note,
    students,
  };

  try {
    localStorage.setItem(LS_ADMIN_STUDENTS, JSON.stringify(payload));
  } catch {
    showToast('خطأ', 'تعذر حفظ بيانات الطلاب في المتصفح', 'error');
  }
}

function persistCards() {
  try {
    localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));
  } catch {
    showToast('خطأ', 'تعذر حفظ بيانات البطاقات في المتصفح', 'error');
  }
}

function readLocalJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function escapeValue(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ensureCardsShape(cardsList) {
  let updated = false;
  cardsList.forEach((card) => {
    if (!card.id) {
      card.id = generateId('card');
      updated = true;
    }
    if (!card.form || typeof card.form !== 'object') {
      card.form = { sections: [] };
      updated = true;
    }
    if (!Array.isArray(card.form.sections)) {
      card.form.sections = [];
      updated = true;
    }
  });
  return updated;
}

function generateId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openCardBuilder(cardId) {
  if (!cardId) return;
  const url = `/admin-card-builder.html?id=${encodeURIComponent(cardId)}`;
  window.open(url, '_blank', 'noopener');
}
