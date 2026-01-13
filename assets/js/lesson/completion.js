/* =========================================================
   completion.js — Card Completion Handling + Certificate Hook
   - Marks card done
   - Prepares certificate payload (for Phase 2)
   - Stores last certificate payload in LocalStorage
   ========================================================= */

import { markCardDone } from '../core/storage.js';
import { showToast } from '../ui/toast.js';
import { goHome } from '../core/router.js';

const LS_CURRENT_STUDENT = 'math:currentStudent';      // set by app.js
const LS_LAST_CERTIFICATE = 'math:lastCertificate';     // prepared here for Phase 2

export function completeLesson({ studentId, week, cardTitle = '' }) {
  // mark card as done
  markCardDone(studentId, week);

  // Prepare certificate payload (Phase 2)
  const student = readCurrentStudent();
  const payload = buildCertificatePayload({ studentId, week, cardTitle, student });
  writeLastCertificate(payload);

  // UI: show completion section if exists
  const completeEl = document.getElementById('lessonComplete');
  if (completeEl) {
    completeEl.classList.remove('hidden');
    completeEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Optional: inject name for future UI usage if you add placeholders later
    // (No dependency on HTML changes الآن)
    completeEl.setAttribute('data-student-name', payload.fullName || payload.firstName || '');
    completeEl.setAttribute('data-week', String(week));
  }

  // Toast includes first name (nice for readiness)
  const firstName = payload.firstName || 'بطل';
  showToast('ممتاز 🎉', `أحسنت يا ${firstName} — تم إنجاز البطاقة`, 'success', 3500);

  // auto return after short delay (can be removed لاحقًا)
  setTimeout(() => {
    goHome();
  }, 2000);
}

/* ---------- Certificate Hook Helpers ---------- */
function readCurrentStudent() {
  try {
    const raw = localStorage.getItem(LS_CURRENT_STUDENT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildCertificatePayload({ studentId, week, cardTitle, student }) {
  const fullName =
    (student?.fullName && String(student.fullName).trim()) ||
    `طالب ${studentId}`;

  const firstName =
    (student?.firstName && String(student.firstName).trim()) ||
    String(fullName).trim().split(' ')[0] ||
    '';

  const issuedAt = new Date().toISOString();

  return {
    version: 1,
    week: Number(week),
    cardTitle: String(cardTitle || ''),
    studentId: String(studentId),
    firstName,
    fullName,
    class: student?.class ? String(student.class) : '',
    issuedAt
  };
}

function writeLastCertificate(payload) {
  try {
    localStorage.setItem(LS_LAST_CERTIFICATE, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}
