/* =========================================================
   input.js — Input Question
   - normalization: trim + collapse spaces
   - future: Arabic digits / fraction normalization
   ========================================================= */

export function renderInputQuestion({ mountEl, question }) {
  mountEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'q q-input';

  const desc = document.createElement('div');
  desc.className = 'q-desc';
  desc.textContent = question.text || '';

  const input = document.createElement('input');
  input.className = 'input ltr';
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = question.placeholder || 'اكتب إجابتك هنا';

  const feedback = document.createElement('div');
  feedback.className = 'q-feedback';
  feedback.textContent = '';

  wrap.appendChild(desc);
  wrap.appendChild(input);
  wrap.appendChild(feedback);

  mountEl.appendChild(wrap);

  function normalize(s) {
    if (s == null) return '';
    return String(s)
      .trim()
      .replace(/\s+/g, ' ');
  }

  function check() {
    const user = normalize(input.value);
    const ans = normalize(question.answer);

    const ok = user !== '' && user === ans;
    feedback.textContent = ok ? 'إجابة صحيحة ✅' : 'مش صحيح، جرّب مرة ثانية';
    feedback.classList.toggle('ok', ok);
    feedback.classList.toggle('err', !ok);
    return ok;
  }

  return { check };
}
