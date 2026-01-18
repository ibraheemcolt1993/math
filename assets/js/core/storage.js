/* =========================================================
   storage.js — LocalStorage Persistence
   - Students progress per device
   ========================================================= */

import { STORAGE_KEYS } from './constants.js';

/* ---------- Internal helpers ---------- */
function readRoot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeRoot(root) {
  localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(root));
}

/* ---------- Student ID ---------- */
export function getLastStudentId() {
  return localStorage.getItem(STORAGE_KEYS.LAST_STUDENT_ID);
}

export function setLastStudentId(studentId) {
  localStorage.setItem(STORAGE_KEYS.LAST_STUDENT_ID, studentId);
}

/* ---------- Student Progress ---------- */
/*
Structure:
students = {
  "123456": {
    cards: {
      "999": {
        done: false,
        progress: { conceptIndex: 0, stepIndex: 0 }
      }
    }
  }
}
*/

export function getStudent(studentId) {
  const root = readRoot();
  if (!root[studentId]) {
    root[studentId] = { cards: {} };
    writeRoot(root);
  }
  return root[studentId];
}

export function getStudentProgress(studentId, week) {
  const student = getStudent(studentId);
  return student.cards[String(week)] || null;
}

export function setStudentProgress(studentId, week, progress) {
  const root = readRoot();
  if (!root[studentId]) root[studentId] = { cards: {} };

  root[studentId].cards[String(week)] = {
    ...(root[studentId].cards[String(week)] || {}),
    progress,
  };

  writeRoot(root);
}

/* ---------- Completion helpers ---------- */
export function clearCardProgress(studentId, week) {
  const root = readRoot();
  if (!root[studentId]?.cards?.[String(week)]) return;

  const card = root[studentId].cards[String(week)];
  delete card.progress;

  root[studentId].cards[String(week)] = card;
  writeRoot(root);
}

export function markCardDone(studentId, week) {
  const root = readRoot();
  if (!root[studentId]) root[studentId] = { cards: {} };

  const key = String(week);
  const prev = root[studentId].cards[key] || {};

  // عندما تُنجز البطاقة: نثبت done ونحذف progress حتى ما يصير Resume على بطاقة منجزة
  const next = { ...prev, done: true };
  delete next.progress;

  root[studentId].cards[key] = next;

  writeRoot(root);
}

export function isCardDone(studentId, week) {
  const student = getStudent(studentId);
  return Boolean(student.cards[String(week)]?.done);
}

export function syncCardCompletions(studentId, completions) {
  if (!studentId || !Array.isArray(completions)) return;
  completions.forEach((completion) => {
    const weekValue = completion?.Week ?? completion?.week;
    if (Number.isInteger(Number(weekValue))) {
      markCardDone(studentId, Number(weekValue));
    }
  });
}
