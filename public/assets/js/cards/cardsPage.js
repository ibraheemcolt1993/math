/* =========================================================
   cardsPage.js — Cards List Logic (index.html)
   - Loads cards from local data
   - Applies sequential locking via prereq
   - Shows completed cards as gold + star (base.css styles)
   - Shows student name (firstName/fullName) instead of "طالب {id}"
   ========================================================= */

import { fetchJson } from '../core/api.js';
import { API_PATHS } from '../core/constants.js';
import { getWeeksForClass } from '../core/gradeMap.js';
import {
  getCachedCards,
  getLastStudentId,
  getStudentCompletions,
  getStudentSession,
  isCardDone,
  setCachedCards,
  syncCardCompletions,
} from '../core/storage.js';
import { goToLesson } from '../core/router.js';
import { showToast } from '../ui/toast.js';

export async function initCardsPage() {
  const studentId = getLastStudentId();
  if (!studentId) return;

  const listEl = document.getElementById('cardsList');
  const studentNameEl = document.getElementById('cardsStudentName');
  let readyWeeks = null;

  const student = getStudentSession();
  const displayName =
    (student?.firstName && String(student.firstName).trim()) ||
    (student?.fullName && String(student.fullName).trim()) ||
    `طالب ${studentId}`;

  if (studentNameEl) studentNameEl.textContent = displayName;

  try {
    const cached = getCachedCards();
    if (cached?.length) {
      renderCards(listEl, filterCardsForStudent(cached, student), studentId, readyWeeks);
    }

    const progress = getStudentCompletions(studentId);
    syncCardCompletions(studentId, progress);

    const [cards, weeks] = await Promise.all([
      fetchJson(API_PATHS.CARDS, { noStore: true }),
      fetchJson(API_PATHS.WEEKS, { noStore: true }),
    ]);
    const normalized = Array.isArray(cards) ? cards : [];
    readyWeeks = normalizeReadyWeeks(weeks);
    setCachedCards(normalized);
    renderCards(listEl, filterCardsForStudent(normalized, student), studentId, readyWeeks);
  } catch (e) {
    showToast('خطأ', 'فشل تحميل البطاقات', 'error');
    console.error(e);
  }
}

function filterCardsForStudent(cards, student) {
  const weeks = getWeeksForClass(student?.class);
  if (!weeks?.length) return cards;
  const allowed = new Set(weeks.map((week) => Number(week)));
  return cards.filter((card) => allowed.has(Number(card.week)));
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
    const done = isCardDone(studentId, card.week);
    const prereqDone = !card.prereq || isCardDone(studentId, card.prereq);
    const locked = !prereqDone;
    const isReady = !readyWeeks || readyWeeks.has(Number(card.week));
    const disabled = !isReady;

    const cardEl = document.createElement('div');
    cardEl.className = `card ${locked ? 'is-locked' : ''} ${done ? 'is-done' : ''} ${disabled ? 'is-disabled' : ''}`;

    cardEl.innerHTML = `
      <div class="card-header">
        <div>
          <h3 class="card-title">${escapeHtml(card.title)}</h3>
          <p class="card-subtitle">الأسبوع ${card.week}</p>
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
        goToLesson(card.week);
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
