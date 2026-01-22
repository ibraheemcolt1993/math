/* =========================================================
   cardsPage.js — Cards List Logic (index.html)
   - Loads cards from local data
   - Applies sequential locking via prereq
   - Shows completed cards as gold + star (base.css styles)
   - Shows student name (firstName/fullName) instead of "طالب {id}"
   ========================================================= */

import { fetchJson } from '../core/api.js';
import { API_PATHS } from '../core/constants.js';
import { normalizeDigits } from '../core/normalizeDigits.js';
import {
  getCachedCards,
  getLastStudentId,
  getStudentCompletions,
  getStudentSession,
  isCardDone,
  setCachedCards,
  setStudentSession,
  syncCardCompletions,
} from '../core/storage.js';
import { goToLesson } from '../core/router.js';
import { showToast } from '../ui/toast.js';

export async function initCardsPage(options = {}) {
  const { didRefresh = false } = options;
  const studentId = getLastStudentId();
  if (!studentId) return;

  const listEl = document.getElementById('cardsList');
  const studentNameEl = document.getElementById('cardsStudentName');
  let readyWeeks = null;

  let student = getStudentSession();
  if (!student?.grade && !didRefresh && student?.id && student?.birthYear) {
    const refreshed = await refreshStudentSession(student);
    if (refreshed) {
      return initCardsPage({ didRefresh: true });
    }
  }

  const classInfo = {
    grade: normalizeDigits(student?.grade ?? ''),
    className: normalizeDigits(student?.class ?? ''),
  };
  const displayName =
    (student?.firstName && String(student.firstName).trim()) ||
    (student?.fullName && String(student.fullName).trim()) ||
    `طالب ${studentId}`;

  if (studentNameEl) studentNameEl.textContent = displayName;

  try {
    const cached = getCachedCards();
    if (cached?.length) {
      renderCards(listEl, cached, studentId, readyWeeks);
    }

    const progress = getStudentCompletions(studentId);
    syncCardCompletions(studentId, progress);

    const cardsUrl = buildCardsUrl(classInfo);
    const [cards, weeks] = await Promise.all([
      fetchJson(cardsUrl, { noStore: true }),
      fetchJson(API_PATHS.WEEKS, { noStore: true }),
    ]);
    const normalized = Array.isArray(cards) ? cards : [];
    readyWeeks = normalizeReadyWeeks(weeks);
    setCachedCards(normalized);
    renderCards(listEl, normalized, studentId, readyWeeks);
  } catch (e) {
    showToast('خطأ', 'فشل تحميل البطاقات', 'error');
    console.error(e);
  }
}

async function refreshStudentSession(session) {
  try {
    const data = await fetchJson(API_PATHS.STUDENT_LOGIN, {
      method: 'POST',
      body: {
        studentId: session.id,
        birthYear: session.birthYear,
      },
    });

    const payload = data?.student ?? data;
    const normalized = normalizeSessionStudent(payload);
    if (normalized?.id) {
      setStudentSession(normalized);
      return normalized;
    }
  } catch (error) {
    console.warn('Student refresh failed', error);
  }

  return null;
}

function parseStudentClass(value) {
  const raw = normalizeDigits(String(value ?? '')).trim();
  if (!raw) return { grade: '', className: '' };
  const match = raw.match(/^(\d+)\s*[/\\-]\s*(\d+)$/);
  if (match) {
    return { grade: match[1], className: match[2] };
  }
  return { grade: raw, className: raw };
}

function normalizeSessionStudent(student) {
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
    class: normalizedClass,
  };
}

function isLegacyClassString(value) {
  const raw = normalizeDigits(String(value ?? '')).trim();
  return /^(\d+)\s*[/\\-]\s*(\d+)$/.test(raw);
}

function buildCardsUrl({ grade, className }) {
  const params = new URLSearchParams();
  if (grade) params.set('grade', grade);
  if (className) params.set('class', className);
  return `${API_PATHS.CARDS}?${params.toString()}`;
}

function normalizeReadyWeeks(weeks) {
  if (!Array.isArray(weeks)) return null;
  const list = weeks
    .map((week) => Number(week?.Week ?? week?.week))
    .filter((week) => Number.isFinite(week));
  return list.length ? new Set(list) : null;
}

function renderCards(container, cards, studentId, readyWeeks) {
  if (!container) return;
  container.innerHTML = '';

  cards.forEach((card) => {
    const weekValue = card.week ?? card.Week;
    const prereqWeek = card.prereqWeek ?? card.PrereqWeek ?? card.prereq;
    const done = isCardDone(studentId, weekValue);
    const prereqDone = !prereqWeek || isCardDone(studentId, prereqWeek);
    const locked = !prereqDone;
    const isReady = !readyWeeks || readyWeeks.has(Number(weekValue));
    const disabled = !isReady;

    const cardEl = document.createElement('div');
    cardEl.className = `card ${locked ? 'is-locked' : ''} ${done ? 'is-done' : ''} ${disabled ? 'is-disabled' : ''}`;

    cardEl.innerHTML = `
      <div class="card-header">
        <div>
          <h3 class="card-title">${escapeHtml(card.title ?? card.Title)}</h3>
          <p class="card-subtitle">الأسبوع ${escapeHtml(weekValue)}</p>
        </div>
        ${done ? starHtml() : ''}
      </div>

      <div class="card-body">
        <span class="badge ${done ? 'done' : disabled ? 'disabled' : locked ? 'locked' : 'primary'}">
          ${done ? 'منجزة' : disabled ? 'غير جاهزة' : locked ? 'مقفلة' : 'مفتوحة'}
        </span>
      </div>

      <div class="card-footer">
        <button class="btn ${locked || disabled ? 'btn-outline' : 'btn-primary'} w-100"
                ${locked || disabled ? 'disabled' : ''}>
          ${disabled ? 'غير متاحة' : done ? 'إعادة فتح' : 'ابدأ'}
        </button>
      </div>
    `;

    const btn = cardEl.querySelector('button');
    if (!locked && !disabled) {
      btn.addEventListener('click', () => {
        goToLesson(weekValue);
      });
    } else if (locked) {
      btn.addEventListener('click', () => {
        showToast('مقفلة 🔒', 'لازم تنهي البطاقة السابقة أولًا', 'warning');
      });
    }

    container.appendChild(cardEl);
  });
}

function starHtml() {
  return `
    <div class="star" title="منجزة">
      <svg viewBox="0 0 24 24">
        <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.6-6.2 3.6 1.6-7-5.4-4.7 7.1-.6z"></path>
      </svg>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
