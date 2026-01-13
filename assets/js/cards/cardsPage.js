/* =========================================================
   cardsPage.js — Cards List (Locking + Completion UI)
   - Loads cards from /data/cards.json
   - Applies sequential locking via prereq
   - Shows completed cards with golden frame + star
   - Navigates to lesson.html?week=XXX on open cards
   ========================================================= */

import { API_PATHS } from '../core/constants.js';
import { fetchJSON } from '../core/api.js';
import { getLastStudentId } from '../core/storage.js';
import { isCardDone } from '../core/storage.js';

export async function initCardsPage({ mountEl }) {
  mountEl.innerHTML = '';

  const studentId = getLastStudentId();
  if (!studentId) {
    mountEl.innerHTML = `<p class="muted">الرجاء إدخال رقم الهوية أولًا.</p>`;
    return;
  }

  let cards = [];
  try {
    cards = await fetchJSON(API_PATHS.CARDS);
  } catch (e) {
    mountEl.innerHTML = `<p class="error">تعذر تحميل البطاقات.</p>`;
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'cards-grid';

  cards.forEach((card, idx) => {
    const done = isCardDone(studentId, card.week);

    // locking rule: open if no prereq OR prereq done
    let locked = false;
    if (card.prereq !== null && card.prereq !== undefined) {
      locked = !isCardDone(studentId, card.prereq);
    }

    const el = document.createElement('div');
    el.className = 'card card-item';

    if (locked) el.classList.add('locked');
    if (done) el.classList.add('done');

    el.innerHTML = `
      <div class="card-body">
        <div class="card-header">
          <span class="card-week">الأسبوع ${card.week}</span>
          ${done ? '<span class="star">⭐</span>' : ''}
        </div>
        <h3 class="card-title">${card.title}</h3>
        <div class="card-status">
          ${
            done
              ? '<span class="status done">منجزة</span>'
              : locked
              ? '<span class="status locked">مقفلة</span>'
              : '<span class="status open">مفتوحة</span>'
          }
        </div>
      </div>
    `;

    if (!locked) {
      el.addEventListener('click', () => {
        window.location.href = `lesson.html?week=${encodeURIComponent(card.week)}`;
      });
    }

    wrap.appendChild(el);
  });

  mountEl.appendChild(wrap);
}
