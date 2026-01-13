/* =========================================================
   cardsPage.js — Cards List Logic (index.html)
   - Loads cards.json
   - Applies sequential locking via prereq
   - Shows completed cards as gold + star (base.css styles)
   - Shows student name (firstName/fullName) instead of "طالب {id}"
   ========================================================= */

import { fetchJson } from '../core/api.js';
import { DATA_PATHS } from '../core/constants.js';
import { getLastStudentId, isCardDone } from '../core/storage.js';
import { goToLesson } from '../core/router.js';
import { showToast } from '../ui/toast.js';

const LS_CURRENT_STUDENT = 'math:currentStudent'; // set by app.js

export async function initCardsPage() {
  const studentId = getLastStudentId();
  if (!studentId) return;

  const listEl = document.getElementById('cardsList');
  const studentNameEl = document.getElementById('cardsStudentName');

  const student = readCurrentStudent();
  const displayName =
    (student?.firstName && String(student.firstName).trim()) ||
    (student?.fullName && String(student.fullName).trim()) ||
    `طالب ${studentId}`;

  if (studentNameEl) studentNameEl.textContent = displayName;

  try {
    const cards = await fetchJson(DATA_PATHS.CARDS, { noStore: true });
    renderCards(listEl, cards, studentId);
  } catch (e) {
    showToast('خطأ', 'فشل تحميل البطاقات', 'error');
    console.error(e);
  }
}

function readCurrentStudent() {
  try {
    const raw = localStorage.getItem(LS_CURRENT_STUDENT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function renderCards(container, cards, studentId) {
  container.innerHTML = '';

  cards.forEach((card) => {
    const done = isCardDone(studentId, card.week);
    const prereqDone = !card.prereq || isCardDone(studentId, card.prereq);
    const locked = !prereqDone;

    const cardEl = document.createElement('div');
    cardEl.className = `card ${locked ? 'is-locked' : ''} ${done ? 'is-done' : ''}`;

    cardEl.innerHTML = `
      <div class="card-header">
        <div>
          <h3 class="card-title">${escapeHtml(card.title)}</h3>
          <p class="card-subtitle">الأسبوع ${card.week}</p>
        </div>
        ${done ? starHtml() : ''}
      </div>

      <div class="card-body">
        <span class="badge ${done ? 'done' : locked ? 'locked' : 'primary'}">
          ${done ? 'منجزة' : locked ? 'مقفلة' : 'مفتوحة'}
        </span>
      </div>

      <div class="card-footer">
        <button class="btn ${locked ? 'btn-outline' : 'btn-primary'} w-100"
                ${locked ? 'disabled' : ''}>
          ${done ? 'إعادة فتح' : 'ابدأ'}
        </button>
      </div>
    `;

    const btn = cardEl.querySelector('button');
    if (!locked) {
      btn.addEventListener('click', () => {
        goToLesson(card.week);
      });
    } else {
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
