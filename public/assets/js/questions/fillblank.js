/* =========================================================
   fillblank.js — Fill in the Blank Question
   - Text supports [[blank]] tokens
   - Answers in question.blanks (array)
   - Persists values on question._blanks
   ========================================================= */

export function renderFillBlankQuestion({ mountEl, question }) {
  mountEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'q q-fillblank';

  const desc = document.createElement('div');
  desc.className = 'q-desc';

  const sentence = document.createElement('div');
  sentence.className = 'fillblank-sentence';

  const feedback = document.createElement('div');
  feedback.className = 'q-feedback';

  const rawText = String(question.text || '');
  const prompt = question.prompt || '';
  if (rawText.includes('[[blank]]')) {
    if (prompt) {
      desc.textContent = prompt;
      wrap.appendChild(desc);
    }
  } else {
    desc.textContent = question.text || '';
    wrap.appendChild(desc);
  }
  wrap.appendChild(sentence);
  wrap.appendChild(feedback);

  mountEl.appendChild(wrap);

  const parts = rawText.split('[[blank]]');
  const blankCount = Math.max(0, parts.length - 1);
  const blanks = Array.isArray(question.blanks) ? question.blanks : [];
  const inputs = [];

  if (!Array.isArray(question._blanks)) {
    question._blanks = Array.from({ length: blankCount }, () => '');
  } else if (question._blanks.length < blankCount) {
    question._blanks = [
      ...question._blanks,
      ...Array.from({ length: blankCount - question._blanks.length }, () => '')
    ];
  }

  parts.forEach((part, index) => {
    if (part) {
      sentence.appendChild(document.createTextNode(part));
    }
    if (index < parts.length - 1) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input fillblank-input';
      input.autocomplete = 'off';
      input.value = question._blanks[index] || '';
      input.placeholder = '...';

      input.addEventListener('input', () => {
        question._blanks[index] = input.value;
      });

      inputs.push(input);
      sentence.appendChild(input);
    }
  });

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

  function compareAnswer(userValue, answerValue) {
    const user = normalizeSpaces(userValue);
    const ans = normalizeSpaces(answerValue);
    const validation = question.validation || {};

    if (validation.numericOnly || Number.isFinite(parseNumericValue(ans))) {
      const userNum = parseNumericValue(user);
      const ansNum = parseNumericValue(ans);
      return Number.isFinite(userNum) && Number.isFinite(ansNum) && userNum === ansNum;
    }

    if (user !== '' && user === ans) return true;

    if (validation.fuzzyAutocorrect) {
      const normalizedUser = normalizeArabic(user);
      const normalizedAns = normalizeArabic(ans);
      if (normalizedUser === normalizedAns) return true;

      return similarity(normalizedUser, normalizedAns) >= 0.85;
    }

    return false;
  }

  function check() {
    if (!blankCount) {
      feedback.textContent = 'لا توجد فراغات محددة.';
      feedback.classList.remove('ok', 'err');
      return true;
    }

    if (blanks.length < blankCount) {
      feedback.textContent = 'لم يتم تحديد إجابات الفراغات كاملة.';
      feedback.classList.remove('ok');
      feedback.classList.add('err');
      return false;
    }

    const userValues = question._blanks || [];
    if (userValues.some((value) => !normalizeSpaces(value))) {
      feedback.textContent = 'أكمل جميع الفراغات أولًا.';
      feedback.classList.remove('ok');
      feedback.classList.add('err');
      return false;
    }

    const ok = blanks.every((ans, index) => compareAnswer(userValues[index] ?? '', ans ?? ''));

    feedback.textContent = ok
      ? 'إجابات صحيحة ✅'
      : 'يوجد فراغ غير صحيح، جرّب مرة ثانية';

    feedback.classList.toggle('ok', ok);
    feedback.classList.toggle('err', !ok);

    return ok;
  }

  return { check };
}
