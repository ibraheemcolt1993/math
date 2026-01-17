/* =========================================================
   app.js — App Bootstrap & Page Router
   - Login uses: (Student ID + Birth Year) against /data/students.json
   - Greets by firstName
   - Stores current student profile for later certificates

   UPDATE (2026-01-14):
   - Fix UI flash: hide all screens first, show correct one
   - Remove old auto-welcome based on lastStudentId only
   ========================================================= */

import { getLastStudentId, setLastStudentId } from './core/storage.js';
import { initCardsPage } from './cards/cardsPage.js';
import { getWeekParam } from './core/router.js';
import { showToast } from './ui/toast.js';
import { initLessonPage } from './lesson/lessonPage.js';
import { fetchJson } from './core/api.js';

const STUDENTS_PATH = '/data/students.json';
const LS_CURRENT_STUDENT = 'math:currentStudent'; // {id,birthYear,firstName,fullName,class}

document.addEventListener('DOMContentLoaded', () => {
  const week = getWeekParam();

  if (week) {
    initLessonPage();
  } else {
    initIndexPage();
  }
});

/* ---------- Index Page Logic ---------- */
function initIndexPage() {
  const screenId = document.getElementById('screen-id');
  const screenWelcome = document.getElementById('screen-welcome');
  const screenCards = document.getElementById('screen-cards');

  const inputId = document.getElementById('studentId');
  const btnLogin = document.getElementById('btnLogin');
  const btnToCards = document.getElementById('btnToCards');
  const btnChangeId = document.getElementById('btnChangeId');
  const btnLogout = document.getElementById('btnLogout');

  const welcomeTitle = document.getElementById('welcomeTitle');
  const welcomeChip = document.getElementById('welcomeChip');

  // Ensure Birth Year input exists (inject if missing)
  const inputBirthYear = ensureBirthYearInput(inputId);

  hideAllScreens();

  const current = readCurrentStudent();
  if (current?.id && current?.birthYear) {
    setLastStudentId(current.id);
    showWelcome(current);
  } else {
    const lastId = getLastStudentId();
    if (lastId && inputId) inputId.value = String(lastId);
    showId();
  }

  async function attemptLogin() {
    const id = (inputId?.value || '').trim();
    const birthYear = (inputBirthYear?.value || '').trim();

    if (!id) {
      showToast('تنبيه', 'ادخل رقم الهوية أولًا', 'warning');
      return;
    }
    if (!birthYear) {
      showToast('تنبيه', 'ادخل سنة الميلاد (مثال: 2012)', 'warning');
      return;
    }

    try {
      const db = await fetchJson(STUDENTS_PATH, { noStore: true });
      const list = Array.isArray(db?.students) ? db.students : [];

      const found = list.find(s => String(s.id) === String(id) && String(s.birthYear) === String(birthYear));

      if (!found) {
        showToast('معلومة غير صحيحة', 'تأكد من رقم الهوية وسنة الميلاد', 'error', 3500);
        return;
      }

      const student = {
        id: String(found.id),
        birthYear: String(found.birthYear),
        firstName: String(found.firstName || '').trim() || String(found.fullName || '').trim().split(' ')[0] || `طالب ${found.id}`,
        fullName: String(found.fullName || '').trim() || `طالب ${found.id}`,
        class: found.class ? String(found.class) : ''
      };

      setLastStudentId(student.id);
      writeCurrentStudent(student);
      showWelcome(student);
      showToast('تم الدخول', `أهلًا ${student.firstName} 👋`, 'success', 2500);
    } catch (e) {
      console.error(e);
      showToast('خطأ', 'تعذر تحميل قاعدة الطلاب (students.json)', 'error', 4000);
    }
  }

  btnLogin?.addEventListener('click', () => {
    attemptLogin();
  });

  const enterHandler = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    attemptLogin();
  };

  inputId?.addEventListener('keydown', enterHandler);
  inputBirthYear?.addEventListener('keydown', enterHandler);

  btnToCards?.addEventListener('click', () => showCards());
  btnChangeId?.addEventListener('click', () => showId());

  btnLogout?.addEventListener('click', () => {
    clearCurrentStudent();
    try { localStorage.removeItem('math:lastStudentId'); } catch {}
    showId();
    if (inputId) inputId.value = '';
    if (inputBirthYear) inputBirthYear.value = '';
  });

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

  function hideAllScreens() {
    setScreenVisibility(screenId, false);
    setScreenVisibility(screenWelcome, false);
    setScreenVisibility(screenCards, false);
  }

  function showId() {
    setScreenVisibility(screenId, true);
    setScreenVisibility(screenWelcome, false);
    setScreenVisibility(screenCards, false);
  }

  function showWelcome(student) {
    const firstName = student?.firstName || student?.id || 'طالب';
    const fullName = student?.fullName || `طالب ${student?.id || ''}`.trim();

    if (welcomeTitle) welcomeTitle.textContent = `مرحبًا يا ${firstName} 👋`;
    if (welcomeChip) welcomeChip.textContent = fullName;

    setScreenVisibility(screenId, false);
    setScreenVisibility(screenWelcome, true);
    setScreenVisibility(screenCards, false);

  }

  function showCards() {
    setScreenVisibility(screenId, false);
    setScreenVisibility(screenWelcome, false);
    setScreenVisibility(screenCards, true);
    initCardsPage();
  }

}

/* ---------- Current Student Profile (LocalStorage) ---------- */
function readCurrentStudent() {
  try {
    const raw = localStorage.getItem(LS_CURRENT_STUDENT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCurrentStudent(student) {
  try {
    localStorage.setItem(LS_CURRENT_STUDENT, JSON.stringify(student));
  } catch {}
}

function clearCurrentStudent() {
  try {
    localStorage.removeItem(LS_CURRENT_STUDENT);
  } catch {}
}

/* ---------- UI: Birth Year input injection ---------- */
function ensureBirthYearInput(inputIdEl) {
  let el = document.getElementById('studentBirthYear');
  if (el) return el;

  if (!inputIdEl) return null;

  const field = inputIdEl.closest('.field') || inputIdEl.parentElement;
  if (!field) return null;

  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.style.marginTop = '12px';

  wrap.innerHTML = `
    <label class="label" for="studentBirthYear">سنة الميلاد</label>
    <input id="studentBirthYear" class="input ltr" inputmode="numeric" autocomplete="off" placeholder="مثال: 2012" />
    <div class="help">اكتب سنة الميلاد فقط (4 أرقام).</div>
  `;

  field.insertAdjacentElement('afterend', wrap);
  el = wrap.querySelector('#studentBirthYear');

  el.addEventListener('input', () => {
    el.value = String(el.value || '').replace(/[^0-9]/g, '').slice(0, 4);
  });

  el.addEventListener('keydown', (e) => {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End','Enter'];
    if (allowed.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (!/^[0-9]$/.test(e.key)) e.preventDefault();
  });

  return el;
}
