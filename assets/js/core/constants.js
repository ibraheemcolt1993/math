/* =========================================================
   constants.js — Global Constants & Paths
   ========================================================= */

// App
export const APP_NAME = 'math';

// Storage keys
export const STORAGE_KEYS = {
  LAST_STUDENT_ID: 'math:lastStudentId',
  STUDENTS: 'math:students', // root object for all students progress
};

// Data paths
export const DATA_PATHS = {
  CARDS: '/data/cards.json',
  WEEKS_DIR: '/data/weeks',
  STUDENTS: '/data/students.json',
};

// API paths
export const API_PATHS = {
  CARDS: '/api/cards',
  ADMIN_CARDS: '/api/cards-mng',
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

// Helpers
export function weekJsonPath(week) {
  return `${DATA_PATHS.WEEKS_DIR}/${week}`;
}
