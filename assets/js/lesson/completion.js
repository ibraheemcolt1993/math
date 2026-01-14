/* =========================================================
   completion.js — Card Completion Handling + Certificate Hook
   - Marks card done
   - Prepares certificate payload
   - Stores last certificate payload in LocalStorage
   - Shows "عرض الشهادة" button on completion (no HTML edits needed)

   UPDATE (2026-01-14):
   - Optional Sync to Google Sheets (completion + certificate payload)
   ========================================================= */

import { markCardDone } from '../core/storage.js';
import { showToast } from '../ui/toast.js';
import { goHome } from '../core/router.js';
import { enqueueSyncEvent, flushSyncQueue } from '../core/sync.js';

const LS_CURRENT_STUDENT = 'math:currentStudent';       // set by app.js
const LS_LAST_CERTIFICATE = 'math:lastCertificate';      // prepared here
const CERT_URL = '/assets/cert/certificate.html';

export function completeLesson({ studentId, week, cardTitle = '' }) {
  // mark card as done
  markCardDone(studentId, week);

  // Prepare certificate payload
  const student = readCurrentStudent();
  const payload = buildCertificatePayload({ studentId, week, cardTitle, student });
  writeLastCertificate(payload);

  // ✅ Optional Sync (best-effort)
  enqueueSyncEvent({
    type: 'completion',
    studentId,
    week,
    payload: {
      week: Number(week),
      cardTitle: String(cardTitle || ''),
      studentId: String(studentId),
      done: true,
      issuedAt: payload.issuedAt,
    },
  });

  enqueueSyncEvent({
    type: 'certificate',
    studentId,
    week,
    payload,
  });

  // try flush now (best effort)
  flushSyncQueue();

  // UI: show completion section if exists
  const completeEl = document.getElementById('lessonComplete');
  if (completeEl) {
    completeEl.classList.remove('hidden');
    completeEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Inject data for future UI usage
    completeEl.setAttribute('data-student-name', payload.fullName || payload.firstName || '');
    completeEl.setAttribute('data-week', String(week));

    // Add certificate button (idempotent)
    ensureCertActions(completeEl);
  }

  // Toast includes first name
  const firstName = payload.firstName || 'بطل';
  showToast('ممتاز 🎉', `أحسنت يا ${firstName} — تم إنجاز البطاقة`, 'success', 3500);

  // NOTE: we no longer auto-return quickly, to allow opening the certificate
  setTimeout(() => {
    // goHome();
  }, 12000);
}

/* ---------- Certificate UI Actions ---------- */
function ensureCertActions(completeEl) {
  if (completeEl.querySelector('#btnViewCert')) return;

  // Find a good place to inject (card-body preferred)
  const body = completeEl.querySelector('.card-body') || completeEl;

  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.style.marginTop = '12px';
  wrap.style.gap = '10px';

  const btnCert = document.createElement('a');
  btnCert.id = 'btnViewCert';
  btnCert.className = 'btn btn-primary btn-lg w-100';
  btnCert.href = CERT_URL;
  btnCert.textContent = 'عرض الشهادة';

  const btnBack = document.createElement('button');
  btnBack.type = 'button';
  btnBack.className = 'btn btn-outline w-100';
  btnBack.textContent = 'العودة للبطاقات';
  btnBack.addEventListener('click', () => goHome());

  wrap.appendChild(btnCert);
  wrap.appendChild(btnBack);
  body.appendChild(wrap);
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
