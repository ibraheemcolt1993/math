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
      sentence.appendChild(buildTokenFragment(part));
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

  function buildTokenFragment(text) {
    const fragment = document.createDocumentFragment();
    const raw = String(text ?? '');
    const regex = /\[\[(frac|table|sqrt|cbrt):([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match = null;

    while ((match = regex.exec(raw)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(raw.slice(lastIndex, match.index)));
      }

      const type = match[1];
      const body = match[2];

      if (type === 'frac') {
        const [top, bottom] = body.split('|');
        const frac = document.createElement('span');
        frac.className = 'token-frac';

        const numerator = document.createElement('span');
        numerator.className = 'token-frac-top';
        numerator.textContent = top ?? '';

        const denominator = document.createElement('span');
        denominator.className = 'token-frac-bottom';
        denominator.textContent = bottom ?? '';

        frac.appendChild(numerator);
        frac.appendChild(denominator);
        fragment.appendChild(frac);
      } else if (type === 'table') {
        const [sizePart, ...cells] = body.split('|');
        const [rowsRaw, colsRaw] = String(sizePart || '').toLowerCase().split('x');
        const rows = Number(rowsRaw);
        const cols = Number(colsRaw);

        if (Number.isInteger(rows) && Number.isInteger(cols) && rows > 0 && cols > 0) {
          const table = document.createElement('table');
          table.className = 'token-table';
          const tbody = document.createElement('tbody');
          let cellIndex = 0;

          for (let r = 0; r < rows; r += 1) {
            const tr = document.createElement('tr');
            for (let c = 0; c < cols; c += 1) {
              const td = document.createElement('td');
              td.textContent = cells[cellIndex] ?? '';
              tr.appendChild(td);
              cellIndex += 1;
            }
            tbody.appendChild(tr);
          }

          table.appendChild(tbody);
          fragment.appendChild(table);
        } else {
          fragment.appendChild(document.createTextNode(match[0]));
        }
      } else if (type === 'sqrt' || type === 'cbrt') {
        const root = document.createElement('span');
        root.className = 'token-root';
        const symbol = document.createElement('span');
        symbol.className = 'token-root-symbol';
        symbol.textContent = type === 'sqrt' ? '√' : '∛';
        const value = document.createElement('span');
        value.className = 'token-root-value';
        value.textContent = body ?? '';
        root.appendChild(symbol);
        root.appendChild(value);
        fragment.appendChild(root);
      } else {
        fragment.appendChild(document.createTextNode(match[0]));
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < raw.length) {
      fragment.appendChild(document.createTextNode(raw.slice(lastIndex)));
    }

    return fragment;
  }

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
      .replace(/ى/g, 'ي')
      .toLowerCase();
  }

  function stripLeadingAl(value) {
    return normalizeSpaces(value)
      .split(' ')
      .map((word) => (word.startsWith('ال') ? word.slice(2) : word))
      .join(' ');
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
    const ans = normalizeSpaces(extractAnswerValue(answerValue));
    const validation = { fuzzyAutocorrect: true, ...(question.validation || {}) };

    if (validation.numericOnly || Number.isFinite(parseNumericValue(ans))) {
      const userNum = parseNumericValue(user);
      const ansNum = parseNumericValue(ans);
      return {
        ok: Number.isFinite(userNum) && Number.isFinite(ansNum) && userNum === ansNum,
        shouldAutocorrect: false
      };
    }

    if (user !== '' && user === ans) return { ok: true, shouldAutocorrect: false };

    if (validation.fuzzyAutocorrect) {
      const normalizedUser = normalizeArabic(user);
      const normalizedAns = normalizeArabic(ans);
      if (normalizedUser === normalizedAns) {
        return { ok: true, shouldAutocorrect: true };
      }
      if (stripLeadingAl(normalizedUser) === stripLeadingAl(normalizedAns)) {
        return { ok: true, shouldAutocorrect: true };
      }
      return { ok: similarity(normalizedUser, normalizedAns) >= 0.85, shouldAutocorrect: false };
    }

    return { ok: false, shouldAutocorrect: false };
  }

  function extractAnswerValue(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      return String(value.answer ?? value.text ?? value.value ?? '');
    }
    return String(value);
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
    const isRequired = question.isRequired !== false;

    if (!isRequired && userValues.every((value) => !normalizeSpaces(value))) {
      feedback.textContent = '';
      feedback.classList.remove('ok', 'err');
      return true;
    }

    if (userValues.some((value) => !normalizeSpaces(value))) {
      feedback.textContent = 'أكمل جميع الفراغات أولًا.';
      feedback.classList.remove('ok');
      feedback.classList.add('err');
      return false;
    }

    let ok = true;
    blanks.forEach((ans, index) => {
      if (!ok) return;
      const result = compareAnswer(userValues[index] ?? '', ans ?? '');
      if (!result.ok) {
        ok = false;
        return;
      }
      if (result.shouldAutocorrect) {
        const resolvedAnswer = extractAnswerValue(ans ?? '');
        if (resolvedAnswer) {
          question._blanks[index] = resolvedAnswer;
          if (inputs[index]) {
            inputs[index].value = resolvedAnswer;
          }
        }
      }
    });

    feedback.textContent = ok
      ? 'إجابات صحيحة ✅'
      : 'يوجد فراغ غير صحيح، جرّب مرة ثانية';

    feedback.classList.toggle('ok', ok);
    feedback.classList.toggle('err', !ok);

    return ok;
  }

  return { check };
}
