/* =========================================================
   input.js — Input Question
   - If expected answer is numeric:
     - mobile keyboard shows numbers (inputmode="numeric")
     - field only accepts digits (even on PC)
     - compare by numeric value (2 == 02 == ٢ == ۲)
   - Otherwise: normal text compare after trim + collapse spaces
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
    // Arabic-Indic: ٠١٢٣٤٥٦٧٨٩
    // Eastern Arabic-Indic: ۰۱۲۳۴۵۶۷۸۹
    const map = {
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
      '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
      '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
      '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    };
    return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
  }

  function numericOnly(str) {
    // keep digits only
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

      // allow Ctrl/Cmd shortcuts (copy/paste/select all)
      if (e.ctrlKey || e.metaKey) return;

      if (!/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    });
  }

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
