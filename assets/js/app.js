/* =========================================================
   app.js — App Bootstrap & Page Router
   - Login uses: (Student ID + Birth Year) against /data/students.json
   - Greets by firstName
   - Stores current student profile for later certificates

   UPDATE (2026-01-14):
   - Fix UI flash: do NOT show ID screen briefly if a valid current student exists
     (hide all screens first, then show the correct one)
   - Remove "old behavior" auto-welcome based on lastStudentId only
     (welcome happens ONLY if currentStudent exists)
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
    // lesson.html
    initLessonPage();
  } else {
    // index.html
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

  // ✅ Prevent flash: hide all screens FIRST, then show the right one
  hideAllScreens();

  // ✅ Auto-welcome ONLY if a real current student exists
  const current = readCurrentStudent();
  if (current?.id && current?.birthYear) {
    // Keep last id synced
    setLastStudentId(current.id);
    showWelcome(current);
  } else {
    // No current student: show login screen (optionally prefill id if it exists)
    const lastId = getLastStudentId();
    if (lastId && inputId) inputId.value = String(lastId);
    showId();
  }

  btnLogin?.addEventListener('click', async () => {
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
  });

  btnToCards?.addEventListener('click', () => {
    showCards();
  });

  btnChangeId?.addEventListener('click', () => {
    showId();
  });

  btnLogout?.addEventListener('click', () => {
    clearCurrentStudent();
    // remove last id as well
    try { localStorage.removeItem('math:lastStudentId'); } catch {}
    showId();
    if (inputId) inputId.value = '';
    if (inputBirthYear) inputBirthYear.value = '';
  });

  function hideAllScreens() {
    screenId?.classList.add('hidden');
    screenWelcome?.classList.add('hidden');
    screenCards?.classList.add('hidden');
  }

  function showId() {
    screenId?.classList.remove('hidden');
    screenWelcome?.classList.add('hidden');
    screenCards?.classList.add('hidden');
  }

  function showWelcome(student) {
    const firstName = student?.firstName || student?.id || 'طالب';
    const fullName = student?.fullName || `طالب ${student?.id || ''}`.trim();

    if (welcomeTitle) welcomeTitle.textContent = `مرحبًا يا ${firstName} 👋`;
    if (welcomeChip) welcomeChip.textContent = fullName;

    screenId?.classList.add('hidden');
    screenWelcome?.classList.remove('hidden');
    screenCards?.classList.add('hidden');
  }

  function showCards() {
    screenId?.classList.add('hidden');
    screenWelcome?.classList.add('hidden');
    screenCards?.classList.remove('hidden');
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

  // if no place to inject, just return null
  if (!inputIdEl) return null;

  // Find nearest container (field) to place after it
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

  // Numeric-only behavior
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
