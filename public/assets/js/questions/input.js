/* =========================================================
   input.js — Input Question
   - If expected answer is numeric:
     - mobile keyboard shows numbers (inputmode="numeric")
     - field only accepts digits (even on PC)
     - compare by numeric value (2 == 02 == ٢ == ۲)
   - Otherwise: normal text compare after trim + collapse spaces
   - Mobile UX: keep input visible above keyboard while typing (VisualViewport)

   UPDATE (2026-01-14):
   - Pressing Enter/Go triggers the main "متابعة" button automatically
   - Persist input value across engine re-renders using question._value

   UPDATE (2026-01-14) #2:
   - Improve keyboard overlap fix:
     * scroll based on the whole question box (.question-wrap), not only the input
     * re-run visibility adjustment after check (so attempts/solution stay visible)
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

  function filterNumericInput(str) {
    return String(str).replace(/[^0-9/.\-+]/g, '');
  }

  function parseNumericValue(value) {
    if (value == null) return NaN;
    const normalized = toLatinDigits(String(value))
      .trim()
      .replace(',', '.')
      .replace(/\s+/g, '');

    if (/^[-+]?[\d.]+\/[-+]?[\d.]+$/.test(normalized)) {
      const [numRaw, denRaw] = normalized.split('/');
      const num = Number(numRaw);
      const den = Number(denRaw);
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return NaN;
      return num / den;
    }

    if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) return NaN;

    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function isNumericAnswer(ans) {
    return Number.isFinite(parseNumericValue(ans));
  }

  function normalizeArabic(value) {
    return normalizeSpaces(value)
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      .replace(/ـ/g, '')
      .replace(/[إأآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/\bال/g, '')
      .toLowerCase();
  }

  function similarity(a, b) {
    if (!a && !b) return 1;
    const aLen = a.length;
    const bLen = b.length;
    if (!aLen || !bLen) return 0;

    const dp = Array.from({ length: aLen + 1 }, () => Array(bLen + 1).fill(0));
    for (let i = 0; i <= aLen; i += 1) dp[i][0] = i;
    for (let j = 0; j <= bLen; j += 1) dp[0][j] = j;

    for (let i = 1; i <= aLen; i += 1) {
      for (let j = 1; j <= bLen; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    const distance = dp[aLen][bLen];
    return 1 - distance / Math.max(aLen, bLen);
  }

  const validation = question.validation || {};
  const expectsNumber = Boolean(validation.numericOnly) || isNumericAnswer(question.answer);

  // Restore previous value (persisted by engine via stable question object)
  if (typeof question._value === 'string' && question._value !== '') {
    input.value = question._value;
  }

  if (expectsNumber) {
    // Mobile: numeric keyboard
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';

    // Desktop/All: restrict to digits only + persist value
    input.addEventListener('input', () => {
      const before = input.value;
      const latin = toLatinDigits(before);
      const filtered = filterNumericInput(latin);
      if (before !== filtered) input.value = filtered;

      // Persist
      question._value = input.value;
    });

    // Block non-digit keys (extra safety)
    input.addEventListener('keydown', (e) => {
      const allowed = [
        'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
        'Tab', 'Home', 'End', 'Enter'
      ];
      if (allowed.includes(e.key)) return;
      if (e.ctrlKey || e.metaKey) return;
      if (!/^[0-9/.\-+]$/.test(e.key)) e.preventDefault();
    });
  } else {
    // Text mode: persist as user types
    input.addEventListener('input', () => {
      question._value = input.value;
    });
  }

  /* ---------- Enter/Go triggers "متابعة" ---------- */
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return;

    e.preventDefault();

    // Find the single main button "متابعة" inside current concept
    const conceptBody = mountEl.closest('.concept-body') || mountEl.closest('.card') || document;
    const btn = conceptBody.querySelector('.lesson-nav .btn');

    if (btn && typeof btn.click === 'function') {
      btn.click();
    }
  });

  /* ---------- Mobile keyboard overlap fix ---------- */
  const isTouchLikely =
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  let vvHandler = null;

  function ensureVisible() {
    // Delay to allow keyboard to open and viewport to resize
    setTimeout(() => {
      const vv = window.visualViewport;

      // Determine current visible bottom in layout viewport coordinates
      let visibleBottomY;
      if (vv) {
        visibleBottomY = vv.pageTop + vv.height;
      } else {
        visibleBottomY = window.scrollY + window.innerHeight;
      }

      // ✅ IMPORTANT: use the whole question box bottom, not just the input
      const qWrap = input.closest('.question-wrap') || input;
      const rect = qWrap.getBoundingClientRect();
      const targetBottomY = window.scrollY + rect.bottom;

      // Comfortable margin (bigger when keyboard is open)
      let extra = 18;
      if (vv) {
        const kb = Math.max(0, window.innerHeight - vv.height); // approximate keyboard height
        // raise more when keyboard is big
        extra += Math.min(160, Math.max(60, Math.round(kb * 0.35)));
      } else {
        extra += 60;
      }

      if (targetBottomY + extra > visibleBottomY) {
        const delta = (targetBottomY + extra) - visibleBottomY;
        window.scrollBy({ top: delta, left: 0, behavior: 'smooth' });
      }
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

    // Persist before checking (safety)
    question._value = rawUser;

    if (expectsNumber) {
      const userNum = parseNumericValue(rawUser);
      const ansNum = parseNumericValue(rawAns);

      const ok = Number.isFinite(userNum) && Number.isFinite(ansNum) && userNum === ansNum;

      feedback.textContent = ok ? 'إجابة صحيحة ✅' : 'مش صحيح، جرّب مرة ثانية';
      feedback.classList.toggle('ok', ok);
      feedback.classList.toggle('err', !ok);

      // ✅ After checking (and possible solution injection), ensure visibility again
      if (!ok) {
        setTimeout(() => ensureVisible(), 80);
      }
      return ok;
    }

    // text mode
    const user = normalizeSpaces(rawUser);
    const ans = normalizeSpaces(rawAns);

    let ok = user !== '' && user === ans;
    let corrected = false;

    if (!ok && validation.fuzzyAutocorrect && user !== '') {
      const normalizedUser = normalizeArabic(user);
      const normalizedAns = normalizeArabic(ans);
      ok = normalizedUser === normalizedAns || similarity(normalizedUser, normalizedAns) >= 0.85;
      corrected = ok;
    }

    if (ok && corrected && ans) {
      input.value = ans;
      question._value = ans;
      feedback.textContent = `إجابة صحيحة ✅ (تم تصحيحها إلى: ${ans})`;
    } else {
      feedback.textContent = ok ? 'إجابة صحيحة ✅' : 'مش صحيح، جرّب مرة ثانية';
    }
    feedback.classList.toggle('ok', ok);
    feedback.classList.toggle('err', !ok);

    // ✅ After checking (and possible solution injection), ensure visibility again
    if (!ok) {
      setTimeout(() => ensureVisible(), 80);
    }
    return ok;
  }

  return { check };
}
