/* =========================================================
   match.js — Matching Question (Structure Only - Phase 2)
   - For now: renders layout and always returns false
   ========================================================= */

export function renderMatchQuestion({ mountEl, question }) {
  mountEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'q q-match';

  const left = document.createElement('div');
  left.className = 'col';

  const right = document.createElement('div');
  right.className = 'col';

  (question.left || []).forEach((t) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.textContent = t;
    left.appendChild(item);
  });

  (question.right || []).forEach((t) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.textContent = t;
    right.appendChild(item);
  });

  wrap.appendChild(left);
  wrap.appendChild(right);

  mountEl.appendChild(wrap);

  function check() {
    // Phase 2: implement drag/select matching logic
    return false;
  }

  return { check };
}
