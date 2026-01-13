/* =========================================================
   toast.js — Material Toast with Countdown Bar
   API: showToast(title, msg, type='info', duration=3000)
   ========================================================= */

let hostEl = null;
let activeToast = null;
let rafId = null;

function ensureHost() {
  if (hostEl) return hostEl;
  hostEl = document.createElement('div');
  hostEl.className = 'toast-host';
  document.body.appendChild(hostEl);
  return hostEl;
}

function iconSvg(type) {
  const common = (path) => `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="${path}"></path>
    </svg>
  `;

  if (type === 'success') {
    return common('M9 16.2l-3.5-3.5L4 14.2l5 5L20 8.2l-1.5-1.5z');
  }
  if (type === 'warning') {
    return common('M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-8h-2v6h2V10z');
  }
  if (type === 'danger' || type === 'error') {
    return common('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z');
  }
  // info
  return common('M11 7h2v2h-2V7zm0 4h2v8h-2v-8zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z');
}

function cleanup() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }
}

function animateBar(barEl, duration) {
  const start = performance.now();

  const tick = (now) => {
    const elapsed = now - start;
    const t = Math.min(1, elapsed / duration);
    // scale from 1 to 0
    barEl.style.transform = `scaleX(${1 - t})`;
    if (t < 1) {
      rafId = requestAnimationFrame(tick);
    }
  };

  rafId = requestAnimationFrame(tick);
}

export function showToast(title, msg, type = 'info', duration = 3000) {
  ensureHost();

  // replace any existing toast (single toast policy)
  cleanup();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.dataset.type = type;

  toast.innerHTML = `
    <div class="toast-inner">
      <div class="toast-ic">${iconSvg(type)}</div>
      <div class="toast-content">
        <p class="toast-title">${escapeHtml(String(title || ''))}</p>
        <p class="toast-msg">${escapeHtml(String(msg || ''))}</p>
      </div>
    </div>
    <div class="toast-bar"><i></i></div>
  `;

  hostEl.appendChild(toast);
  activeToast = toast;

  // show
  requestAnimationFrame(() => {
    toast.classList.add('is-show');
  });

  // animate bar
  const bar = toast.querySelector('.toast-bar > i');
  if (bar) animateBar(bar, duration);

  // auto hide
  window.setTimeout(() => {
    if (!activeToast) return;
    activeToast.classList.remove('is-show');
    window.setTimeout(() => cleanup(), 260);
  }, duration);
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
