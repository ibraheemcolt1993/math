/* =========================================================
   lessonPage.js — Lesson Page Bootstrap
   - Reads student + week
   - Loads week JSON
   - Initializes engine
   ========================================================= */

import { getWeekParam, goHome } from '../core/router.js';
import { fetchJson } from '../core/api.js';
import { weekJsonPath } from '../core/constants.js';
import { getLastStudentId } from '../core/storage.js';
import { showToast } from '../ui/toast.js';
import { initEngine } from './engine.js';

export async function initLessonPage() {
  const week = getWeekParam();
  const studentId = getLastStudentId();

  if (!week) {
    goHome();
    return;
  }

  if (!studentId) {
    showToast('تنبيه', 'لازم تدخل رقم الهوية أولًا', 'warning');
    goHome();
    return;
  }

  // UI refs
  const titleEl = document.getElementById('lessonTitle');
  const studentEl = document.getElementById('lessonStudent');
  const weekEl = document.getElementById('lessonWeek');
  const contentEl = document.getElementById('lessonContent');

  studentEl.textContent = `طالب ${studentId}`;
  weekEl.textContent = `week ${week}`;

  try {
    const data = await fetchJson(weekJsonPath(week), { noStore: true });

    titleEl.textContent = data.title || `بطاقة الأسبوع ${week}`;

    // init engine
    initEngine({
      week,
      studentId,
      data,
      mountEl: contentEl,
    });
  } catch (e) {
    console.error(e);
    titleEl.textContent = 'خطأ في تحميل البطاقة';
    showToast('خطأ', 'تعذر تحميل بيانات الدرس', 'error');
  }
}
