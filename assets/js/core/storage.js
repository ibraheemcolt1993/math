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

export function markCardDone(studentId, week) {
  const root = readRoot();
  if (!root[studentId]) root[studentId] = { cards: {} };

  root[studentId].cards[String(week)] = {
    ...(root[studentId].cards[String(week)] || {}),
    done: true,
  };

  writeRoot(root);
}

export function isCardDone(studentId, week) {
  const student = getStudent(studentId);
  return Boolean(student.cards[String(week)]?.done);
}
