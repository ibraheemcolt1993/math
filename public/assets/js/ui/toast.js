/* =========================================================
   toast.js — Material Toast with Countdown Bar
   API: showToast(title, msg, type='info', duration=3000)

   UPDATE (2026-01-14):
   - Host is pinned to TOP of the VISUAL viewport (not the layout viewport)
     using visualViewport.offsetTop/offsetLeft + height/width.
   - This avoids cases where toast appears "too high" and requires scrolling
     to reveal it on mobile browsers.
   ========================================================= */

let hostEl = null;
let activeToast = null;
let rafId = null;
let bound = false;

function ensureHost() {
  if (hostEl) return hostEl;

  hostEl = document.createElement('div');
  hostEl.className = 'toast-host';
  document.body.appendChild(hostEl);

  updateHostToVisualViewport();

  if (!bound) {
    bound = true;

    // Resize/orientation changes
    window.addEventListener('resize', updateHostToVisualViewport, { passive: true });
    window.addEventListener('scroll', updateHostToVisualViewport, { passive: true });

    // Mobile browser UI + keyboard changes
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateHostToVisualViewport, { passive: true });
      window.visualViewport.addEventListener('scroll', updateHostToVisualViewport, { passive: true });
    }
  }

  return hostEl;
}

function updateHostToVisualViewport() {
  if (!hostEl) return;

  const vv = window.visualViewport;

  // Default (no VisualViewport support)
  let top = 0;
  let left = 0;
  let width = window.innerWidth;
  let height = window.innerHeight;

  if (vv) {
    top = Math.round(vv.offsetTop || 0);
    left = Math.round(vv.offsetLeft || 0);
    width = Math.round(vv.width || window.innerWidth);
    height = Math.round(vv.height || window.innerHeight);
  }

  // Place host at the top of the VISUAL viewport.
  // We keep position:fixed + inset:0 in CSS, and move the whole host.
  hostEl.style.transform = `translate(${left}px, ${top}px)`;

  // Limit interactions area to the visible viewport (optional but clean)
  hostEl.style.width = `${width}px`;
  hostEl.style.height = `${height}px`;
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
    barEl.style.transform = `scaleX(${t})`;
    if (t < 1) {
      rafId = requestAnimationFrame(tick);
    }
  };

  rafId = requestAnimationFrame(tick);
}

export function showToast(title, msg, type = 'info', duration = 3000) {
  ensureHost();

  // Refresh position each time (mobile UI can change between toasts)
  updateHostToVisualViewport();

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

  requestAnimationFrame(() => {
    toast.classList.add('is-show');
  });

  const bar = toast.querySelector('.toast-bar > i');
  if (bar) animateBar(bar, duration);

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
