/* =========================================================
   mcq.js — Multiple Choice Question (Single Correct)
   - Fix: enforce single selection by using one shared radio group name
   ========================================================= */

export function renderMcqQuestion({ mountEl, question }) {
  mountEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'q q-mcq';

  const desc = document.createElement('div');
  desc.className = 'q-desc';
  desc.textContent = question.text || '';

  wrap.appendChild(desc);

  let selectedIndex = null;

  // IMPORTANT: one shared group name for all choices (prevents multi-select)
  const groupName = `mcq-${Math.random().toString(36).slice(2)}`;

  (question.choices || []).forEach((choice, idx) => {
    const label = document.createElement('label');
    label.className = 'choice';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = String(idx);

    const span = document.createElement('span');
    span.textContent = choice;

    // Keep selectedIndex in sync
    radio.addEventListener('change', () => {
      selectedIndex = idx;
    });

    label.appendChild(radio);
    label.appendChild(span);

    wrap.appendChild(label);
  });

  const feedback = document.createElement('div');
  feedback.className = 'q-feedback';
  wrap.appendChild(feedback);

  mountEl.appendChild(wrap);

  function check() {
    const ok = selectedIndex === question.correctIndex;

    feedback.textContent = ok
      ? 'إجابة صحيحة ✅'
      : 'إجابة خاطئة ❌ حاول مرة ثانية';

    feedback.classList.toggle('ok', ok);
    feedback.classList.toggle('err', !ok);

    // visual mark
    const choicesEls = wrap.querySelectorAll('.choice');
    choicesEls.forEach((el, i) => {
      el.classList.remove('correct', 'wrong');
      if (selectedIndex != null) {
        if (i === question.correctIndex) el.classList.add('correct');
        else if (i === selectedIndex) el.classList.add('wrong');
      }
    });

    return ok;
  }

  return { check };
}
