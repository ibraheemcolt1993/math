/* =========================================================
   router.js — Query String Reader & Navigation Helpers
   ========================================================= */

export function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

export function getWeekParam() {
  const w = getQueryParam('week');
  if (!w) return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}

export function goTo(url) {
  window.location.href = url;
}

export function goHome() {
  goTo('/');
}

export function goToLesson(week) {
  goTo(`/lesson.html?week=${encodeURIComponent(week)}`);
}
