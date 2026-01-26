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

  let currentSession = normalizeStoredStudent(getStudentSession());
  if (!currentSession?.grade) {
    const legacyStudent = readCurrentStudent();
    if (legacyStudent && (legacyStudent?.Grade || legacyStudent?.grade || legacyStudent?.Class || legacyStudent?.class)) {
      const migratedSession = normalizeStoredStudent(legacyStudent);
      setStudentSession(migratedSession);
      currentSession = migratedSession;
    }
  }
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

      const legacyClassValue = found?.class ?? found?.Class ?? '';
      const gradeValue = found?.grade ?? found?.Grade ?? '';
      let resolvedGrade = '';
      let resolvedClass = '';

      if (isLegacyClassString(legacyClassValue)) {
        const legacyInfo = parseStudentClass(legacyClassValue);
        resolvedGrade = legacyInfo.grade;
        resolvedClass = legacyInfo.className;
      } else if (gradeValue && legacyClassValue) {
        resolvedGrade = String(gradeValue);
        resolvedClass = String(legacyClassValue);
      }

      const student = {
        id: String(found.id),
        birthYear: String(found.birthYear),
        firstName: String(found.firstName || '').trim() || String(found.fullName || '').trim().split(' ')[0] || `طالب ${found.id}`,
        fullName: String(found.fullName || '').trim() || `طالب ${found.id}`,
        grade: resolvedGrade,
        class: resolvedClass,
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

function readCurrentStudent() {
  try {
    const raw = localStorage.getItem(LS_CURRENT_STUDENT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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
    const session = normalizeStoredStudent(getStudentSession()) || normalizeStoredStudent(student);
    const gradeValue = session?.grade ?? session?.Grade ?? '';
    const hasGrade = isNumericValue(gradeValue);
    const cardsUrl = buildCardsUrl(session || student);
    const [progress, cards] = await Promise.all([
      fetchJson(`${API_PATHS.PROGRESS_COMPLETED}?studentId=${encodeURIComponent(student.id)}`, { noStore: true }),
      hasGrade ? fetchJson(cardsUrl, { noStore: true }) : Promise.resolve(null),
    ]);

    setStudentCompletions(student.id, Array.isArray(progress) ? progress : []);
    syncCardCompletions(student.id, Array.isArray(progress) ? progress : []);
    if (hasGrade) {
      setCachedCards(Array.isArray(cards) ? cards : []);
    }
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
  const fullName = student.fullName ?? student.FullName ?? student.name ?? student.Name ?? '';
  const firstName = student.firstName ?? student.FirstName ?? '';
  const resolvedFullName = String(fullName || '').trim() || `طالب ${normalizedId}`.trim();
  const resolvedFirstName =
    String(firstName || '').trim() ||
    resolvedFullName.split(' ')[0] ||
    `طالب ${normalizedId}`.trim();
  const resolvedGrade = student.grade ?? student.Grade ?? '';
  const resolvedClass = student.class ?? student.Class ?? '';
  let normalizedGrade = String(resolvedGrade);
  let normalizedClass = String(resolvedClass);

  if (!normalizedGrade && isLegacyClassString(normalizedClass)) {
    const legacyInfo = parseStudentClass(normalizedClass);
    normalizedGrade = legacyInfo.grade;
    normalizedClass = legacyInfo.className;
  }

  return {
    id: String(normalizedId),
    birthYear: String(normalizedBirthYear),
    firstName: resolvedFirstName,
    fullName: resolvedFullName,
    grade: normalizedGrade,
    class: normalizedClass
  };
}

function parseStudentClass(value) {
  const raw = normalizeDigits(String(value ?? '')).trim();
  if (!raw) return { grade: '', className: '' };
  const match = raw.match(/^(\\d+)\\s*[/\\-]\\s*(\\d+)$/);
  if (match) {
    return { grade: match[1], className: match[2] };
  }
  return { grade: raw, className: '' };
}

function isLegacyClassString(value) {
  const raw = normalizeDigits(String(value ?? '')).trim();
  return /^(\\d+)\\s*[/\\-]\\s*(\\d+)$/.test(raw);
}

function isNumericValue(value) {
  const raw = normalizeDigits(String(value ?? '')).trim();
  return raw !== '' && /^\\d+$/.test(raw);
}

function buildCardsUrl(student = {}) {
  const params = new URLSearchParams();
  const rawGrade = student?.grade ?? student?.Grade ?? '';
  const rawClass = student?.class ?? student?.Class ?? student?.className ?? '';
  let gradeValue = normalizeDigits(String(rawGrade ?? '')).trim();
  let classValue = normalizeDigits(String(rawClass ?? '')).trim();
  const rawClassString = String(rawClass ?? '').trim();
  const isAllClasses = rawClassString.toUpperCase() === 'ALL_CLASSES';

  if ((!gradeValue || !isNumericValue(gradeValue)) && isLegacyClassString(rawClass)) {
    const { grade, className } = parseStudentClass(rawClass);
    gradeValue = grade;
    classValue = className;
  }

  if ((!gradeValue || !isNumericValue(gradeValue)) && isLegacyClassString(rawGrade)) {
    const { grade, className } = parseStudentClass(rawGrade);
    gradeValue = grade;
    classValue = className;
  }

  if (isNumericValue(gradeValue)) {
    params.set('grade', gradeValue);
  }

  if (isAllClasses) {
    params.set('class', 'ALL_CLASSES');
  } else if (isNumericValue(classValue)) {
    params.set('class', classValue);
  }

  const query = params.toString();
  return query ? `${API_PATHS.CARDS}?${query}` : API_PATHS.CARDS;
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
