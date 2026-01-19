/* =========================================================
   app.js — App Bootstrap & Page Router
   - Login uses: (Student ID + Birth Year) against local data
   - Greets by firstName
   - Stores current student profile for later certificates

   UPDATE (2026-01-14):
   - Fix UI flash: hide all screens first, show correct one
   - Remove old auto-welcome based on lastStudentId only
   ========================================================= */

import {
  clearStudentSession,
  getLastStudentId,
  getStudentSession,
  setCachedCards,
  setLastStudentId,
  setStudentCompletions,
  setStudentSession,
  syncCardCompletions,
} from './core/storage.js';
import { initCardsPage } from './cards/cardsPage.js';
import { getWeekParam } from './core/router.js';
import { showToast } from './ui/toast.js';
import { initLessonPage } from './lesson/lessonPage.js';
import { findStudentByIdentity } from './core/students.js';
import { fetchJson } from './core/api.js';
import { API_PATHS } from './core/constants.js';
import { normalizeDigits } from './core/normalizeDigits.js';

const LS_CURRENT_STUDENT = 'math:currentStudent'; // legacy cache

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
  const welcomeName = document.getElementById('welcomeName');

  // Ensure Birth Year input exists (inject if missing)
  const inputBirthYear = ensureBirthYearInput(inputId);

  hideAllScreens();

  const currentSession = normalizeStoredStudent(getStudentSession());
  if (currentSession?.id && currentSession?.birthYear) {
    setLastStudentId(currentSession.id);
    showCards();
    loadStudentData(currentSession, { silent: true });
  } else {
    const lastId = getLastStudentId();
    if (lastId && inputId) inputId.value = String(lastId);
    showId();
  }

  async function attemptLogin() {
    const id = normalizeDigits(inputId?.value || '').trim();
    const birthYear = normalizeDigits(inputBirthYear?.value || '').trim();

    if (!id) {
      showToast('تنبيه', 'ادخل رقم الهوية أولًا', 'warning');
      return;
    }
    if (!birthYear) {
      showToast('تنبيه', 'ادخل سنة الميلاد (مثال: 2012)', 'warning');
      return;
    }

    const fallbackLogin = async () => {
      const found = await findStudentByIdentity(id, birthYear);

      if (!found) {
        showToast('بيانات غير صحيحة', 'تأكد من رقم الهوية وسنة الميلاد', 'warning', 3500);
        return;
      }

      const student = {
        id: String(found.id),
        birthYear: String(found.birthYear),
        firstName: String(found.firstName || '').trim() || String(found.fullName || '').trim().split(' ')[0] || `طالب ${found.id}`,
        fullName: String(found.fullName || '').trim() || `طالب ${found.id}`,
        class: found.class ? String(found.class) : '',
      };

      setLastStudentId(student.id);
      setStudentSession(student);
      writeCurrentStudent(student);
      showWelcome(student);
      showToast('تم الدخول', `أهلًا ${student.firstName} 👋`, 'success', 2500);
      await loadStudentData(student);
    };

    try {
      setLoginLoading(true);
      const data = await fetchJson(API_PATHS.STUDENT_LOGIN, {
        method: 'POST',
        body: { studentId: id, birthYear },
      });

      const payload = data?.student ?? data;
      const profile = normalizeStoredStudent(payload);

      if (profile?.id && profile?.birthYear) {
        writeCurrentStudent(payload);
        setStudentSession(profile);
        if (profile?.id) setLastStudentId(profile.id);
        showWelcome(profile);
        showToast('تم الدخول', `أهلًا ${profile.firstName} 👋`, 'success', 2500);
        await loadStudentData(profile);
        return;
      }
    } catch (e) {
      console.warn('API login failed, falling back to local data.', e);
    } finally {
      setLoginLoading(false);
    }

    try {
      await fallbackLogin();
    } catch (e) {
      console.error(e);
      showToast('خطأ', 'تعذر تحميل بيانات الطلاب', 'error', 4000);
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
    clearStudentSession();
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

  function setAppReady() {
    document.body.classList.remove('is-loading');
  }

  function setLoginLoading(isLoading) {
    if (!btnLogin) return;
    btnLogin.disabled = isLoading;
    btnLogin.textContent = isLoading ? 'جارٍ التحقق...' : 'دخول';
  }

  function showId() {
    setAppReady();
    setScreenVisibility(screenId, true);
    setScreenVisibility(screenWelcome, false);
    setScreenVisibility(screenCards, false);
  }

  function showWelcome(student) {
    const firstName = student?.firstName || student?.id || 'طالب';
    const fullName = student?.fullName || `طالب ${student?.id || ''}`.trim();

    if (welcomeTitle) welcomeTitle.textContent = `مرحبًا يا ${firstName} 👋`;
    if (welcomeChip) welcomeChip.textContent = fullName;
    if (welcomeName) welcomeName.textContent = fullName;

    setAppReady();
    setScreenVisibility(screenId, false);
    setScreenVisibility(screenWelcome, true);
    setScreenVisibility(screenCards, false);

  }

  function showCards() {
    setAppReady();
    setScreenVisibility(screenId, false);
    setScreenVisibility(screenWelcome, false);
    setScreenVisibility(screenCards, true);
    initCardsPage();
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

async function loadStudentData(student, { silent = false } = {}) {
  if (!student?.id) return;

  const btnToCards = document.getElementById('btnToCards');
  const originalLabel = btnToCards?.textContent;
  if (btnToCards) {
    btnToCards.disabled = true;
    btnToCards.textContent = 'جاري التحميل...';
  }

  try {
    const [progress, cards] = await Promise.all([
      fetchJson(`${API_PATHS.PROGRESS_COMPLETED}?studentId=${encodeURIComponent(student.id)}`, { noStore: true }),
      fetchJson(API_PATHS.CARDS, { noStore: true }),
    ]);

    setStudentCompletions(student.id, Array.isArray(progress) ? progress : []);
    syncCardCompletions(student.id, Array.isArray(progress) ? progress : []);
    setCachedCards(Array.isArray(cards) ? cards : []);
  } catch (error) {
    if (!silent) {
      showToast('خطأ', error.message || 'تعذر تحميل بيانات الطالب', 'error');
    }
  } finally {
    if (btnToCards) {
      btnToCards.disabled = false;
      btnToCards.textContent = originalLabel || 'الانتقال للبطاقات';
    }
  }
}

function normalizeStoredStudent(student) {
  if (!student) return null;
  const normalizedId = student.id ?? student.studentId ?? student.StudentId ?? '';
  const normalizedBirthYear = student.birthYear ?? student.BirthYear ?? '';
  const fullName = student.fullName ?? student.FullName ?? '';
  const firstName = student.firstName ?? student.FirstName ?? '';
  const resolvedFullName = String(fullName || '').trim() || `طالب ${normalizedId}`.trim();
  const resolvedFirstName =
    String(firstName || '').trim() ||
    resolvedFullName.split(' ')[0] ||
    `طالب ${normalizedId}`.trim();

  return {
    id: String(normalizedId),
    birthYear: String(normalizedBirthYear),
    firstName: resolvedFirstName,
    fullName: resolvedFullName,
    class: String(student.class ?? student.Class ?? '')
  };
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
    el.value = normalizeDigits(String(el.value || '')).replace(/[^0-9]/g, '').slice(0, 4);
  });

  el.addEventListener('keydown', (e) => {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End','Enter'];
    if (allowed.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (!/^[0-9٠-٩۰-۹]$/.test(e.key)) e.preventDefault();
  });

  return el;
}
