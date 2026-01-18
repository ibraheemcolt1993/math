/* =========================================================
   lessonPage.js — Lesson Page Bootstrap
   - Reads student + week
   - Loads week JSON
   - Initializes engine
   - Shows student name (firstName/fullName) instead of id
   ========================================================= */

import { getWeekParam, goHome } from '../core/router.js';
import { fetchJson } from '../core/api.js';
import { weekJsonPath } from '../core/constants.js';
import { getLastStudentId } from '../core/storage.js';
import { showToast } from '../ui/toast.js';
import { initEngine } from './engine.js';

const LS_CURRENT_STUDENT = 'math:currentStudent';

export async function initLessonPage() {
  const week = getWeekParam();
  const studentId = getLastStudentId();

  if (!week) {
    goHome();
    return;
  }

  if (!studentId) {
    showToast('تنبيه', 'لازم تدخل بيانات الطالب أولًا', 'warning');
    goHome();
    return;
  }

  const student = readCurrentStudent();
  const displayName =
    (student?.firstName && String(student.firstName).trim()) ||
    (student?.fullName && String(student.fullName).trim()) ||
    `طالب ${studentId}`;

  // UI refs
  const titleEl = document.getElementById('lessonTitle');
  const studentEl = document.getElementById('lessonStudent');
  const weekEl = document.getElementById('lessonWeek');
  const contentEl = document.getElementById('lessonContent');
  const completeEl = document.getElementById('lessonComplete');

  studentEl.textContent = displayName;
  weekEl.textContent = `week ${week}`;

  if (completeEl) {
    completeEl.classList.add('hidden');
    completeEl.setAttribute('hidden', 'hidden');
  }

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

function readCurrentStudent() {
  try {
    const raw = localStorage.getItem(LS_CURRENT_STUDENT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
