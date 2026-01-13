/* =========================================================
   input.js — Input Question
   - If expected answer is numeric:
     - mobile keyboard shows numbers (inputmode="numeric")
     - field only accepts digits (even on PC)
     - compare by numeric value (2 == 02 == ٢ == ۲)
   - Otherwise: normal text compare after trim + collapse spaces
   - Mobile UX: keep input visible above keyboard while typing (VisualViewport)
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

  function normalizeSpaces(s) {
    if (s == null) return '';
    return String(s).trim().replace(/\s+/g, ' ');
  }

  function toLatinDigits(str) {
    const map = {
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
      '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
      '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
      '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    };
    return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
  }

  function numericOnly(str) {
    return String(str).replace(/[^0-9]/g, '');
  }

  function isNumericAnswer(ans) {
    const a = numericOnly(toLatinDigits(normalizeSpaces(ans)));
    return a.length > 0 && /^[0-9]+$/.test(a);
  }

  const expectsNumber = isNumericAnswer(question.answer);

  if (expectsNumber) {
    // Mobile: numeric keyboard
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';

    // Desktop/All: restrict to digits only
    input.addEventListener('input', () => {
      const before = input.value;
      const latin = toLatinDigits(before);
      const filtered = numericOnly(latin);
      if (before !== filtered) input.value = filtered;
    });

    // Block non-digit keys (extra safety)
    input.addEventListener('keydown', (e) => {
      const allowed = [
        'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
        'Tab', 'Home', 'End', 'Enter'
      ];
      if (allowed.includes(e.key)) return;
      if (e.ctrlKey || e.metaKey) return;
      if (!/^[0-9]$/.test(e.key)) e.preventDefault();
    });
  }

  /* ---------- Mobile keyboard overlap fix ---------- */
  const isTouchLikely =
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  let vvHandler = null;

  function ensureVisible() {
    // Delay to allow keyboard to open and viewport to resize
    setTimeout(() => {
      // If VisualViewport exists, use it for precise offset
      const vv = window.visualViewport;

      // Determine current visible bottom in layout viewport coordinates
      let visibleBottomY;
      if (vv) {
        visibleBottomY = vv.pageTop + vv.height;
      } else {
        visibleBottomY = window.scrollY + window.innerHeight;
      }

      const rect = input.getBoundingClientRect();
      const inputTopY = window.scrollY + rect.top;
      const inputBottomY = window.scrollY + rect.bottom;

      // Keep a comfortable margin above keyboard / bottom
      const margin = 18;

      // If input is under the visible bottom, scroll down
      if (inputBottomY + margin > visibleBottomY) {
        const delta = (inputBottomY + margin) - visibleBottomY;
        window.scrollBy({ top: delta, left: 0, behavior: 'smooth' });
        return;
      }

      // If input is too high (rare), we can center it slightly
      // (Optional) keep stable: do nothing
    }, 260);
  }

  function onFocus() {
    if (!isTouchLikely) return;

    ensureVisible();

    // Also react to viewport changes while keyboard is animating
    const vv = window.visualViewport;
    if (vv && !vvHandler) {
      vvHandler = () => ensureVisible();
      vv.addEventListener('resize', vvHandler);
      vv.addEventListener('scroll', vvHandler);
    }
  }

  function onBlur() {
    const vv = window.visualViewport;
    if (vv && vvHandler) {
      vv.removeEventListener('resize', vvHandler);
      vv.removeEventListener('scroll', vvHandler);
      vvHandler = null;
    }
  }

  input.addEventListener('focus', onFocus);
  input.addEventListener('blur', onBlur);

  /* ---------- Check ---------- */
  function check() {
    const rawUser = input.value ?? '';
    const rawAns = question.answer ?? '';

    if (expectsNumber) {
      const userDigits = numericOnly(toLatinDigits(rawUser));
      const ansDigits = numericOnly(toLatinDigits(rawAns));

      const userNum = userDigits === '' ? NaN : Number(userDigits);
      const ansNum = ansDigits === '' ? NaN : Number(ansDigits);

      const ok = Number.isFinite(userNum) && Number.isFinite(ansNum) && userNum === ansNum;

      feedback.textContent = ok ? 'إجابة صحيحة ✅' : 'مش صحيح، جرّب مرة ثانية';
      feedback.classList.toggle('ok', ok);
      feedback.classList.toggle('err', !ok);
      return ok;
    }

    // text mode
    const user = normalizeSpaces(rawUser);
    const ans = normalizeSpaces(rawAns);

    const ok = user !== '' && user === ans;

    feedback.textContent = ok ? 'إجابة صحيحة ✅' : 'مش صحيح، جرّب مرة ثانية';
    feedback.classList.toggle('ok', ok);
    feedback.classList.toggle('err', !ok);
    return ok;
  }

  return { check };
}
