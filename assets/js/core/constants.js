/* =========================================================
   constants.js — Global Constants & Paths
   ========================================================= */

// App
export const APP_NAME = 'math';

// Storage keys
export const STORAGE_KEYS = {
  LAST_STUDENT_ID: 'math:lastStudentId',
  STUDENTS: 'math:students', // root object for all students progress

  // Optional Sync (Google Sheets)
  SYNC_ENABLED: 'math:syncEnabled', // '1'|'0'
  SYNC_QUEUE: 'math:syncQueue',     // queued events
};

// Data paths
export const DATA_PATHS = {
  CARDS: '/data/cards.json',
  WEEKS_DIR: '/data/weeks',
};

// Lesson / Engine
export const ENGINE = {
  MAX_ATTEMPTS: 3,
};

// UI defaults
export const UI = {
  TOAST_DURATION_SHORT: 2500,
  TOAST_DURATION_MEDIUM: 3500,
  TOAST_DURATION_LONG: 5000,
};

// Progress
export const PROGRESS = {
  START: 0,
  COMPLETE: 100,
};

// Optional Sync (Google Apps Script Web App)
export const SYNC = {
  // ضع رابط Web App هنا بعد نشر Google Apps Script
  ENDPOINT: 'https://script.google.com/macros/s/AKfycby21G617_uHALVYKB2iN-wl4wy1_qC0xc6ZYtLxf8OBnnh6nT5FobudJFzeiOjh0v7m/exec',

  // (اختياري) سر بسيط للحماية — لازم يطابق اللي بتحطه في Apps Script
  SECRET: '',
};

// Helpers
export function weekJsonPath(week) {
  return `${DATA_PATHS.WEEKS_DIR}/week${week}.json`;
}
