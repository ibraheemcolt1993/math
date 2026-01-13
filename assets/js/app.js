/* =========================================================
   app.js — App Bootstrap & Page Router
   ========================================================= */

import { getLastStudentId, setLastStudentId } from './core/storage.js';
import { initCardsPage } from './cards/cardsPage.js';
import { getWeekParam } from './core/router.js';
import { showToast } from './ui/toast.js';
import { initLessonPage } from './lesson/lessonPage.js';

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

  const lastId = getLastStudentId();
  if (lastId) {
    showWelcome(lastId);
  }

  btnLogin?.addEventListener('click', () => {
    const id = (inputId.value || '').trim();
    if (!id) {
      showToast('تنبيه', 'ادخل رقم الهوية أولًا', 'warning');
      return;
    }
    setLastStudentId(id);
    showWelcome(id);
  });

  btnToCards?.addEventListener('click', () => {
    showCards();
  });

  btnChangeId?.addEventListener('click', () => {
    showId();
  });

  btnLogout?.addEventListener('click', () => {
    showId();
  });

  function showId() {
    screenId.classList.remove('hidden');
    screenWelcome.classList.add('hidden');
    screenCards.classList.add('hidden');
  }

  function showWelcome(studentId) {
    welcomeTitle.textContent = `مرحبًا يا ${studentId} 👋`;
    welcomeChip.textContent = `طالب ${studentId}`;

    screenId.classList.add('hidden');
    screenWelcome.classList.remove('hidden');
    screenCards.classList.add('hidden');
  }

  function showCards() {
    screenId.classList.add('hidden');
    screenWelcome.classList.add('hidden');
    screenCards.classList.remove('hidden');
    initCardsPage();
  }
}
