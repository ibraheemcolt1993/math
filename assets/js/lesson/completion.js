/* =========================================================
   completion.js — Card Completion Handling
   ========================================================= */

import { markCardDone } from '../core/storage.js';
import { showToast } from '../ui/toast.js';
import { goHome } from '../core/router.js';

export function completeLesson({ studentId, week }) {
  // mark card as done
  markCardDone(studentId, week);

  // UI: show completion section if exists
  const completeEl = document.getElementById('lessonComplete');
  if (completeEl) {
    completeEl.classList.remove('hidden');
    completeEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast('ممتاز 🎉', 'تم إنجاز البطاقة بنجاح', 'success', 3500);

  // auto return after short delay (can be removed لاحقًا)
  setTimeout(() => {
    goHome();
  }, 2000);
}
